(() => {
  'use strict';

  const { Core } = globalThis.RedditToolbox;
  const ACTIVE_STATES = new Set(['running', 'waiting', 'paused', 'stopping']);
  const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

  class BatchRunner {
    constructor(worker, options = {}) {
      if (typeof worker !== 'function') throw new TypeError('A worker function is required.');
      this.worker = worker;
      const minimumDelayMs = Number(options.minimumDelayMs);
      const maximumDelayMs = Number(options.maximumDelayMs);
      const maxRetries = Number(options.maxRetries);
      const maxConsecutiveFailures = Number(options.maxConsecutiveFailures);
      this.minimumDelayMs = Number.isFinite(minimumDelayMs) ? Math.max(0, minimumDelayMs) : 4_500;
      this.maximumDelayMs = Number.isFinite(maximumDelayMs)
        ? Math.max(this.minimumDelayMs, maximumDelayMs)
        : Math.max(this.minimumDelayMs, 8_500);
      this.maxRetries = Number.isFinite(maxRetries)
        ? Math.max(0, Math.min(5, Math.trunc(maxRetries)))
        : 2;
      this.continueOnFailure = options.continueOnFailure !== false;
      this.maxConsecutiveFailures = Number.isFinite(maxConsecutiveFailures)
        ? Math.max(1, Math.min(20, Math.trunc(maxConsecutiveFailures)))
        : 5;
      this.sleep = options.sleep || wait;
      this.random = options.random || Math.random;
      this.onEvent = options.onEvent || (() => {});
      this.lockManager = options.lockManager === undefined ? globalThis.navigator?.locks : options.lockManager;
      this.lockName = String(options.lockName || 'reddit-toolbox-cleanup');
      this.state = 'idle';
      this.stopRequested = false;
      this.pauseReason = '';
      this.resumeResolvers = [];
      this.plan = null;
      this.currentIndex = -1;
      this.consecutiveFailures = 0;
    }

    progress() {
      const summary = Core.planSummary(this.plan);
      const current = this.currentIndex >= 0 ? this.plan?.items?.[this.currentIndex] || null : null;
      return {
        summary,
        total: summary.total,
        processed: summary.processed,
        remaining: summary.remaining,
        percent: summary.percent,
        currentIndex: this.currentIndex,
        currentNumber: current ? this.currentIndex + 1 : 0,
        currentFullname: current?.content?.fullname || null
      };
    }

    emit(type, detail = {}) {
      this.onEvent({
        type,
        state: this.state,
        at: new Date().toISOString(),
        ...this.progress(),
        ...detail
      });
    }

    pause(reason = 'Batch paused by user.') {
      if (!['running', 'waiting'].includes(this.state)) return false;
      this.state = 'paused';
      this.pauseReason = reason;
      this.emit('batch-paused', { reason });
      return true;
    }

    resume() {
      if (this.state !== 'paused') return false;
      this.state = 'running';
      this.pauseReason = '';
      const resolvers = this.resumeResolvers.splice(0);
      for (const resolve of resolvers) resolve();
      this.emit('batch-resumed');
      return true;
    }

    stop() {
      if (!ACTIVE_STATES.has(this.state)) return false;
      this.stopRequested = true;
      this.state = 'stopping';
      const resolvers = this.resumeResolvers.splice(0);
      for (const resolve of resolvers) resolve();
      this.emit('stop-requested');
      return true;
    }

    async waitWhilePaused() {
      while (this.state === 'paused' && !this.stopRequested) {
        await new Promise((resolve) => this.resumeResolvers.push(resolve));
      }
    }

    async waitDelay(milliseconds, reason, detail = {}) {
      let remainingMs = Math.max(0, Number(milliseconds) || 0);
      if (!remainingMs) return !this.stopRequested;

      await this.waitWhilePaused();
      if (this.stopRequested) return false;
      this.state = 'waiting';
      this.emit('wait-started', { waitReason: reason, remainingMs, ...detail });

      while (remainingMs > 0 && !this.stopRequested) {
        if (this.state === 'paused') {
          await this.waitWhilePaused();
          if (this.stopRequested) break;
          this.state = 'waiting';
        }
        const step = Math.min(1_000, remainingMs);
        await this.sleep(step);
        remainingMs -= step;
        if (remainingMs > 0 && !this.stopRequested) {
          this.emit('wait-tick', { waitReason: reason, remainingMs, ...detail });
        }
      }

      if (this.stopRequested) return false;
      this.state = 'running';
      this.emit('wait-finished', { waitReason: reason, remainingMs: 0, ...detail });
      return true;
    }

    async process(queueItem, index, total) {
      queueItem.status = 'processing';
      queueItem.phase = 'starting';
      queueItem.startedAt = new Date().toISOString();
      this.emit('item-started', { queueItem, index, total });

      const reportPhase = (phase, detail = {}) => {
        queueItem.phase = phase;
        this.emit('item-phase', { queueItem, index, total, phase, phaseDetail: detail });
      };

      for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
        queueItem.attempts += 1;
        try {
          const outcome = await this.worker(queueItem.content, {
            attempt: attempt + 1,
            index,
            total,
            reportPhase,
            isStopRequested: () => this.stopRequested
          });
          queueItem.outcome = outcome || { status: 'completed' };
          queueItem.status = outcome?.status === 'skipped' ? 'skipped' : 'completed';
          queueItem.phase = queueItem.status;
          queueItem.finishedAt = new Date().toISOString();
          this.consecutiveFailures = 0;
          this.emit('item-finished', { queueItem, index, total });
          return;
        } catch (error) {
          if (error?.pauseRequired) {
            this.pause(error.message || 'Reddit needs attention before the batch can continue.');
            this.emit('attention-required', { queueItem, error, index, total });
            await this.waitWhilePaused();
            if (this.stopRequested) break;
            attempt -= 1;
            continue;
          }

          await this.waitWhilePaused();
          if (this.stopRequested) break;

          if (error instanceof Core.RateLimitError || error?.code === 'RATE_LIMITED') {
            const delayMs = Math.max(1_000, Number(error.retryAfterMs) || 60_000);
            this.emit('rate-limited', { queueItem, error, delayMs, index, total });
            const shouldContinue = await this.waitDelay(delayMs, 'rate-limit', { index, total });
            if (!shouldContinue) break;
            attempt -= 1;
            continue;
          }

          if (error?.retryable && attempt < this.maxRetries) {
            const delayMs = Math.min(60_000, 2_000 * (2 ** attempt));
            this.emit('item-retry', { queueItem, error, delayMs, index, total });
            const shouldContinue = await this.waitDelay(delayMs, 'retry', { index, total });
            if (!shouldContinue) break;
            continue;
          }

          queueItem.error = {
            name: error?.name || 'Error',
            code: error?.code || 'UNKNOWN_ERROR',
            message: error?.message || String(error)
          };
          queueItem.status = 'failed';
          queueItem.phase = 'failed';
          queueItem.finishedAt = new Date().toISOString();
          this.consecutiveFailures += 1;
          this.emit('item-failed', { queueItem, error, index, total });

          if (!this.continueOnFailure) {
            this.stopRequested = true;
            this.state = 'stopping';
            this.emit('failure-stop', { queueItem, error, index, total });
          } else if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
            const reason = `Paused after ${this.consecutiveFailures} consecutive failures.`;
            this.pause(reason);
            this.emit('failure-guard', { queueItem, error, index, total, reason });
            await this.waitWhilePaused();
            if (!this.stopRequested) this.consecutiveFailures = 0;
          }
          return;
        }
      }

      if (queueItem.status === 'processing') {
        queueItem.status = 'stopped';
        queueItem.phase = 'stopped';
        queueItem.finishedAt = new Date().toISOString();
      }
    }

    async withRunLock(operation) {
      if (this.lockManager?.request) {
        return this.lockManager.request(
          this.lockName,
          { mode: 'exclusive', ifAvailable: true },
          async (lock) => {
            if (!lock) throw new Error('Another Reddit Toolbox batch is already active.');
            return operation();
          }
        );
      }

      const key = '__redditToolboxActiveBatchRunner';
      if (globalThis[key] && globalThis[key] !== this) {
        throw new Error('Another Reddit Toolbox batch is already active.');
      }
      globalThis[key] = this;
      try {
        return await operation();
      } finally {
        if (globalThis[key] === this) delete globalThis[key];
      }
    }

    async run(plan) {
      if (ACTIVE_STATES.has(this.state)) throw new Error('This batch runner is already active.');
      return this.withRunLock(() => this.runBatch(plan));
    }

    async runBatch(plan) {
      if (!Core.isPlanCurrent(plan)) throw new Error('The reviewed batch changed. Build a new preview.');
      if (!plan.items.some((item) => item.status === 'ready')) {
        throw new Error('This batch has no queued items.');
      }

      this.plan = plan;
      this.state = 'running';
      this.stopRequested = false;
      this.pauseReason = '';
      this.currentIndex = -1;
      this.consecutiveFailures = 0;
      plan.status = 'running';
      plan.startedAt = new Date().toISOString();
      plan.finishedAt = null;
      this.emit('batch-started', { plan });

      for (let index = 0; index < plan.items.length; index += 1) {
        const queueItem = plan.items[index];
        if (queueItem.status !== 'ready') continue;
        this.currentIndex = index;
        await this.waitWhilePaused();
        if (this.stopRequested) break;
        await this.process(queueItem, index, plan.items.length);
        this.emit('batch-progress', { queueItem, index, total: plan.items.length });
        if (this.stopRequested) break;

        const hasMore = plan.items.slice(index + 1).some((item) => item.status === 'ready');
        if (hasMore) {
          const delayMs = Core.randomBetween(this.minimumDelayMs, this.maximumDelayMs, this.random);
          this.emit('cooldown', { delayMs, index, total: plan.items.length });
          const shouldContinue = await this.waitDelay(delayMs, 'between-items', {
            index,
            total: plan.items.length
          });
          if (!shouldContinue) break;
        }
      }

      this.currentIndex = -1;
      plan.finishedAt = new Date().toISOString();
      if (this.stopRequested) {
        for (const item of plan.items) {
          if (item.status === 'ready') {
            item.status = 'stopped';
            item.phase = 'stopped';
          }
        }
        plan.status = 'stopped';
        this.state = 'stopped';
        this.emit('batch-stopped', { plan });
      } else {
        plan.status = 'completed';
        this.state = 'completed';
        this.emit('batch-completed', { plan });
      }
      return Core.planSummary(plan);
    }
  }

  Core.wait = wait;
  Core.BatchRunner = BatchRunner;
  Core.ControlledRunner = BatchRunner;
})();
