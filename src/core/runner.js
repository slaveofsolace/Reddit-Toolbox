(() => {
  'use strict';

  const { Core } = globalThis.RedditToolbox;

  const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

  class ControlledRunner {
    constructor(worker, options = {}) {
      if (typeof worker !== 'function') throw new TypeError('A worker function is required.');
      this.worker = worker;
      const minimumDelayMs = Number(options.minimumDelayMs);
      const maximumDelayMs = Number(options.maximumDelayMs);
      const maxRetries = Number(options.maxRetries);
      this.minimumDelayMs = Number.isFinite(minimumDelayMs) ? Math.max(0, minimumDelayMs) : 4_500;
      this.maximumDelayMs = Number.isFinite(maximumDelayMs)
        ? Math.max(this.minimumDelayMs, maximumDelayMs)
        : Math.max(this.minimumDelayMs, 8_500);
      this.maxRetries = Number.isFinite(maxRetries)
        ? Math.max(0, Math.min(5, Math.trunc(maxRetries)))
        : 2;
      this.sleep = options.sleep || wait;
      this.random = options.random || Math.random;
      this.onEvent = options.onEvent || (() => {});
      this.state = 'idle';
      this.stopRequested = false;
      this.resumeResolvers = [];
    }

    emit(type, detail = {}) {
      this.onEvent({ type, state: this.state, at: new Date().toISOString(), ...detail });
    }

    pause(reason = 'Paused by user.') {
      if (this.state !== 'running') return;
      this.state = 'paused';
      this.emit('paused', { reason });
    }

    resume() {
      if (this.state !== 'paused') return;
      this.state = 'running';
      const resolvers = this.resumeResolvers.splice(0);
      for (const resolve of resolvers) resolve();
      this.emit('resumed');
    }

    stop() {
      this.stopRequested = true;
      if (this.state === 'paused') this.resume();
      this.emit('stop-requested');
    }

    async waitWhilePaused() {
      while (this.state === 'paused' && !this.stopRequested) {
        await new Promise((resolve) => this.resumeResolvers.push(resolve));
      }
    }

    async waitDelay(milliseconds) {
      let remaining = Math.max(0, Number(milliseconds) || 0);
      while (remaining > 0 && !this.stopRequested) {
        const step = Math.min(1_000, remaining);
        await this.sleep(step);
        remaining -= step;
      }
      return !this.stopRequested;
    }

    async process(queueItem, index, total) {
      queueItem.status = 'processing';
      queueItem.startedAt = new Date().toISOString();
      this.emit('item-started', { queueItem, index, total });

      for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
        queueItem.attempts += 1;
        try {
          const outcome = await this.worker(queueItem.content, {
            attempt: attempt + 1,
            index,
            total
          });
          queueItem.outcome = outcome || { status: 'completed' };
          queueItem.status = outcome?.status === 'skipped' ? 'skipped' : 'completed';
          queueItem.finishedAt = new Date().toISOString();
          this.emit('item-finished', { queueItem, index, total });
          return;
        } catch (error) {
          if (error?.pauseRequired) {
            this.pause(error.message || 'The service needs attention before the run can continue.');
            this.emit('attention-required', { queueItem, error, index, total });
            await this.waitWhilePaused();
            if (this.stopRequested) break;
            attempt -= 1;
            continue;
          }

          if (error instanceof Core.RateLimitError || error?.code === 'RATE_LIMITED') {
            const delayMs = Math.max(1_000, Number(error.retryAfterMs) || 60_000);
            this.emit('rate-limited', { queueItem, error, delayMs, index, total });
            await this.waitDelay(delayMs);
            if (this.stopRequested) break;
            attempt -= 1;
            continue;
          }

          if (error?.retryable && attempt < this.maxRetries) {
            const delayMs = Math.min(60_000, 2_000 * (2 ** attempt));
            this.emit('item-retry', { queueItem, error, delayMs, index, total });
            await this.waitDelay(delayMs);
            if (this.stopRequested) break;
            continue;
          }

          queueItem.error = {
            name: error?.name || 'Error',
            code: error?.code || 'UNKNOWN_ERROR',
            message: error?.message || String(error)
          };
          queueItem.status = 'failed';
          queueItem.finishedAt = new Date().toISOString();
          this.emit('item-failed', { queueItem, error, index, total });
          return;
        }
      }

      queueItem.status = 'stopped';
      queueItem.finishedAt = new Date().toISOString();
    }

    async run(plan) {
      if (this.state === 'running' || this.state === 'paused') {
        throw new Error('This runner is already active.');
      }
      if (!Core.isPlanCurrent(plan)) throw new Error('The reviewed plan changed. Build a new preview.');

      this.state = 'running';
      this.stopRequested = false;
      this.emit('run-started', { plan });

      for (let index = 0; index < plan.items.length; index += 1) {
        const queueItem = plan.items[index];
        if (queueItem.status !== 'ready') continue;
        await this.waitWhilePaused();
        if (this.stopRequested) break;
        await this.process(queueItem, index, plan.items.length);
        if (this.stopRequested) break;

        const hasMore = plan.items.slice(index + 1).some((item) => item.status === 'ready');
        if (hasMore) {
          const delayMs = Core.randomBetween(this.minimumDelayMs, this.maximumDelayMs, this.random);
          this.emit('cooldown', { delayMs, index, total: plan.items.length });
          await this.waitDelay(delayMs);
        }
      }

      if (this.stopRequested) {
        for (const item of plan.items) {
          if (item.status === 'ready') item.status = 'stopped';
        }
        this.state = 'stopped';
        this.emit('run-stopped', { plan });
      } else {
        this.state = 'completed';
        this.emit('run-completed', { plan });
      }
      return Core.planSummary(plan);
    }
  }

  Core.wait = wait;
  Core.ControlledRunner = ControlledRunner;
})();
