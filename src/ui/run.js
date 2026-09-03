(() => {
  'use strict';

  const { Core, Reddit, UI } = globalThis.RedditToolbox;
  const ACTIVE_STATES = new Set(['running', 'waiting', 'paused', 'stopping']);

  const PHASE_LABELS = Object.freeze({
    starting: 'Starting item',
    'checking-session': 'Rechecking the signed-in account',
    'checking-ownership': 'Checking ownership',
    'preparing-replacement': 'Generating random replacement text',
    overwriting: 'Overwriting the original text',
    'waiting-for-save': 'Waiting for Reddit to save the overwrite',
    'verifying-overwrite': 'Verifying the saved replacement',
    deleting: 'Deleting the item',
    'deleting-direct': 'Deleting a non-editable post',
    'verifying-deletion': 'Confirming deletion',
    complete: 'Item complete',
    completed: 'Item complete',
    skipped: 'Item skipped',
    failed: 'Item failed',
    stopped: 'Item stopped'
  });

  function batchPhaseLabel(phase) {
    return PHASE_LABELS[phase] || 'Processing item';
  }

  function secondsLabel(milliseconds) {
    return `${Math.max(1, Math.ceil(Number(milliseconds || 0) / 1_000))}s`;
  }

  class RunMethods {
    refreshControls() {
      const active = Boolean(this.runner && ACTIVE_STATES.has(this.runner.state));
      const locked = Boolean(active || this.busy);
      const summary = this.plan ? Core.planSummary(this.plan) : Core.planSummary(null);
      const confirmed = Boolean(
        this.plan
        && summary.ready > 0
        && Core.isPlanCurrent(this.plan)
        && this.refs.confirmationInput.value.trim() === this.plan.confirmation
      );
      this.refs.start.disabled = locked || !confirmed;
      this.refs.pause.disabled = !active || this.runner?.state === 'stopping';
      this.refs.stop.disabled = !active || this.runner?.state === 'stopping';
      this.refs.retry.disabled = locked || !(summary.failed || summary.stopped);
      this.refs.pause.textContent = this.runner?.state === 'paused' ? 'Resume batch' : 'Pause batch';
      this.refs.exportLog.disabled = !this.plan || !this.plan.items.some((item) => item.status !== 'ready');

      for (const element of this.shadow.querySelectorAll('.scope-section input, .scope-section select, .scope-section button')) {
        element.disabled = locked;
      }
    }

    setLauncherState(state = 'idle', summary = null) {
      if (!this.refs.launcher) return;
      if (this.completionResetTimer) {
        clearTimeout(this.completionResetTimer);
        this.completionResetTimer = null;
      }
      const current = summary || (this.plan ? Core.planSummary(this.plan) : Core.planSummary(null));
      this.refs.launcher.classList.remove('running', 'paused', 'stopping', 'completed', 'failed');
      this.refs.launcherBadge.hidden = true;
      this.refs.launcherBadge.textContent = '';

      if (['running', 'waiting'].includes(state)) {
        this.refs.launcher.classList.add('running');
        this.refs.launcherLabel.textContent = `${current.percent}%`;
        this.refs.launcherBadge.hidden = current.remaining === 0;
        this.refs.launcherBadge.textContent = String(current.remaining);
        this.refs.launcher.title = `${current.processed}/${current.total} processed`;
        return;
      }
      if (state === 'paused') {
        this.refs.launcher.classList.add('paused');
        this.refs.launcherLabel.textContent = '!';
        this.refs.launcherBadge.hidden = current.remaining === 0;
        this.refs.launcherBadge.textContent = String(current.remaining);
        this.refs.launcher.title = 'Reddit Toolbox needs attention';
        return;
      }
      if (state === 'stopping' || state === 'stopped') {
        this.refs.launcher.classList.add('stopping');
        this.refs.launcherLabel.textContent = '■';
        this.refs.launcherBadge.hidden = current.remaining === 0;
        this.refs.launcherBadge.textContent = String(current.remaining);
        this.refs.launcher.title = 'Batch stopped';
        return;
      }
      if (state === 'completed') {
        this.refs.launcher.classList.add(current.failed ? 'failed' : 'completed');
        this.refs.launcherLabel.textContent = current.failed ? '!' : '✓';
        this.refs.launcher.title = current.failed ? 'Batch completed with failures' : 'Batch completed';
        this.completionResetTimer = setTimeout(() => {
          if (!this.runner || !ACTIVE_STATES.has(this.runner.state)) this.setLauncherState('idle');
        }, 5_000);
        return;
      }

      this.refs.launcherLabel.textContent = 'RT';
      this.refs.launcher.title = 'Open Reddit Toolbox';
    }

    log(message) {
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      this.logLines.push(`${time}  ${message}`);
      this.logLines = this.logLines.slice(-160);
      this.refs.log.textContent = this.logLines.join('\n');
      this.refs.log.scrollTop = this.refs.log.scrollHeight;
    }

    updateQueueRow(queueItem) {
      const row = Array.from(this.refs.preview.querySelectorAll('.item'))
        .find((candidate) => candidate.dataset.queueId === queueItem.id);
      const status = row?.querySelector('.item-status');
      if (!status) return;
      status.className = `item-status ${queueItem.status}`;
      const detail = queueItem.error?.message
        || queueItem.outcome?.reason
        || batchPhaseLabel(queueItem.phase);
      status.textContent = `${queueItem.status} · ${detail}`;
    }

    updateBatchMetrics(event) {
      const summary = event.summary || (this.plan ? Core.planSummary(this.plan) : Core.planSummary(null));
      this.refs.progress.max = Math.max(1, summary.total);
      this.refs.progress.value = summary.processed;
      this.refs.processedCount.textContent = String(summary.processed);
      this.refs.remainingCount.textContent = String(summary.remaining);
      this.refs.failedCount.textContent = String(summary.failed);
      this.refs.currentCount.textContent = event.currentNumber ? `${event.currentNumber}/${summary.total}` : '—';
      return summary;
    }

    handleRunnerEvent(event) {
      const summary = this.updateBatchMetrics(event);
      if (event.queueItem) this.updateQueueRow(event.queueItem);

      switch (event.type) {
        case 'batch-started':
          this.log(`Automated batch started with ${event.plan.items.length} items. No further confirmation is needed.`);
          this.refs.currentAction.textContent = 'Starting the automated batch…';
          break;
        case 'item-started':
          this.log(`Item ${event.index + 1}/${event.total} started: ${event.queueItem.content.fullname}.`);
          this.refs.currentAction.textContent = `Item ${event.index + 1}/${event.total} · starting`;
          break;
        case 'item-phase':
          this.refs.currentAction.textContent = `Item ${event.index + 1}/${event.total} · ${batchPhaseLabel(event.phase)}`;
          break;
        case 'item-finished':
          this.log(`Item ${event.index + 1}/${event.total}: ${event.queueItem.outcome.reason}.`);
          break;
        case 'item-failed':
          this.log(`Item ${event.index + 1}/${event.total}: failed — ${UI.compactError(event.error)}.`);
          break;
        case 'item-retry':
          this.log(`Item ${event.index + 1}/${event.total}: retrying automatically in ${secondsLabel(event.delayMs)}.`);
          break;
        case 'rate-limited':
          this.log(`Reddit rate limit: the batch will continue automatically in ${secondsLabel(event.delayMs)}.`);
          break;
        case 'cooldown':
          this.refs.currentAction.textContent = `Pacing requests · next item in ${secondsLabel(event.delayMs)}`;
          break;
        case 'wait-started':
        case 'wait-tick': {
          const prefix = event.waitReason === 'rate-limit'
            ? 'Rate limited · continuing automatically in'
            : event.waitReason === 'retry'
              ? 'Retrying automatically in'
              : 'Pacing requests · next item in';
          this.refs.currentAction.textContent = `${prefix} ${secondsLabel(event.remainingMs)}`;
          break;
        }
        case 'wait-finished':
          this.refs.currentAction.textContent = 'Continuing the automated batch…';
          break;
        case 'attention-required':
          this.open();
          this.log(`Batch paused: ${UI.compactError(event.error)}`);
          this.refs.currentAction.textContent = `Attention required · ${UI.compactError(event.error)}`;
          break;
        case 'batch-paused':
          this.log(event.reason);
          this.refs.currentAction.textContent = event.reason;
          break;
        case 'batch-resumed':
          this.log('Automated batch resumed.');
          this.refs.currentAction.textContent = 'Continuing the automated batch…';
          break;
        case 'failure-guard':
          this.open();
          this.log(event.reason);
          break;
        case 'stop-requested':
          this.log('Stop requested; the current item will finish, then the batch will stop.');
          this.refs.currentAction.textContent = 'Stopping after the current item…';
          break;
        case 'batch-stopped':
          this.log('Batch stopped. Remaining items can be prepared as one retry batch.');
          this.refs.currentAction.textContent = 'Batch stopped · prepare a retry batch for remaining items.';
          break;
        case 'batch-completed':
          this.log('Automated batch completed.');
          this.refs.currentAction.textContent = summary.failed
            ? 'Batch complete with failed items available for retry.'
            : 'Batch complete.';
          break;
        default:
          break;
      }

      const status = event.state === 'paused'
        ? `Paused · ${summary.processed}/${summary.total} processed · ${summary.remaining} remaining`
        : event.state === 'stopping'
          ? `Stopping · ${summary.processed}/${summary.total} processed · ${summary.remaining} remaining`
          : `${summary.processed}/${summary.total} processed · ${summary.completed} deleted · ${summary.skipped} skipped · ${summary.failed} failed`;
      this.setStatus(this.refs.runStatus, status, summary.failed ? 'error' : '');
      this.setLauncherState(event.state, summary);
      this.refreshControls();
    }

    async startRun() {
      if (this.busy || (this.runner && ACTIVE_STATES.has(this.runner.state))) return;
      if (!this.plan || !Core.isPlanCurrent(this.plan)) {
        this.setStatus(this.refs.runStatus, 'The batch changed. Prepare a new preview.', 'error');
        return;
      }
      const before = Core.planSummary(this.plan);
      if (!before.ready) {
        this.setStatus(this.refs.runStatus, 'This batch has no queued items.', 'error');
        return;
      }
      if (this.refs.confirmationInput.value.trim() !== this.plan.confirmation) return;

      this.settings = this.readSettingsFromForm();
      this.busy = true;
      this.refreshControls();
      this.logLines = [];
      this.refs.log.textContent = '';
      this.refs.confirmationInput.value = '';
      this.setStatus(this.refs.runStatus, 'Verifying the Reddit session before starting…');
      try {
        const client = this.ensureClient();
        const session = await client.getSession(true);
        this.username = session.username;
        const reuseService = Boolean(
          this.plan.retryOf
          && this.removalService
          && this.removalServiceClient === client
        );
        const service = reuseService
          ? this.removalService
          : new Reddit.RedditRemovalService(client, {
            ...this.plan.options,
            expectedUsername: session.username,
            randomSource: globalThis.crypto
          });
        this.removalService = service;
        this.removalServiceClient = client;
        this.runner = new Core.BatchRunner((item, context) => service.remove(item, context), {
          minimumDelayMs: this.settings.minimumDelaySeconds * 1_000,
          maximumDelayMs: this.settings.maximumDelaySeconds * 1_000,
          maxRetries: 2,
          continueOnFailure: this.plan.options.continueOnFailure,
          maxConsecutiveFailures: this.plan.options.maxConsecutiveFailures,
          onEvent: (event) => this.handleRunnerEvent(event)
        });
        this.refreshControls();
        await this.runner.run(this.plan);
        const summary = Core.planSummary(this.plan);
        const message = summary.stopped
          ? `${summary.completed} deleted; ${summary.stopped} remaining items stopped.`
          : summary.failed
            ? `${summary.completed} deleted; ${summary.failed} failed items can be retried as one batch.`
            : `${summary.completed} deleted, ${summary.skipped} skipped. Automated batch complete.`;
        this.setStatus(
          this.refs.runStatus,
          message,
          summary.failed || summary.stopped ? 'error' : 'success'
        );
      } catch (error) {
        this.setStatus(this.refs.runStatus, UI.compactError(error), 'error');
        this.log(`Batch could not start: ${UI.compactError(error)}`);
        this.setLauncherState('paused', this.plan ? Core.planSummary(this.plan) : null);
      } finally {
        this.busy = false;
        this.refreshControls();
      }
    }

    async togglePause() {
      if (!this.runner) return;
      if (this.runner.state === 'paused') {
        this.setStatus(this.refs.runStatus, 'Refreshing the Reddit session before resuming…');
        try {
          await this.ensureClient().getSession(true);
          this.runner.resume();
        } catch (error) {
          this.setStatus(this.refs.runStatus, UI.compactError(error), 'error');
          this.log(`Resume blocked: ${UI.compactError(error)}`);
        }
      } else {
        this.runner.pause();
      }
      this.refreshControls();
    }

    stopRun() {
      this.runner?.stop();
      this.refreshControls();
    }

    prepareRetryBatch() {
      if (this.busy || !this.plan || (this.runner && ACTIVE_STATES.has(this.runner.state))) return;
      const retry = Core.createRetryPlan(this.plan);
      if (!retry) {
        this.setStatus(this.refs.runStatus, 'There are no failed or stopped items to retry.');
        return;
      }
      this.plan = retry;
      this.refs.confirmationInput.value = '';
      this.renderPlan();
      this.setStatus(
        this.refs.runStatus,
        `Retry batch prepared with ${retry.items.length} items. Review once, confirm once, then run the full batch.`
      );
      this.open();
    }

    exportBackup() {
      if (!this.plan) return;
      const payload = {
        exportedAt: new Date().toISOString(),
        username: this.username || null,
        planId: this.plan.id,
        planDigest: this.plan.digest,
        mode: this.plan.mode,
        items: this.plan.items.map(({ content }) => content)
      };
      Core.downloadText(
        `${UI.safeFilenamePart(this.username)}-reddit-toolbox-backup-${Date.now()}.json`,
        JSON.stringify(payload, null, 2)
      );
    }

    exportLog() {
      if (!this.plan) return;
      const payload = {
        exportedAt: new Date().toISOString(),
        username: this.username || null,
        planId: this.plan.id,
        planDigest: this.plan.digest,
        mode: this.plan.mode,
        retryOf: this.plan.retryOf,
        summary: Core.planSummary(this.plan),
        items: this.plan.items.map((item) => ({
          fullname: item.content.fullname,
          kind: item.content.kind,
          subreddit: item.content.subreddit,
          permalink: item.content.permalink,
          createdAt: new Date(item.content.createdAt).toISOString(),
          status: item.status,
          phase: item.phase,
          attempts: item.attempts,
          outcome: item.outcome,
          error: item.error
        }))
      };
      Core.downloadText(
        `${UI.safeFilenamePart(this.username)}-reddit-toolbox-log-${Date.now()}.json`,
        JSON.stringify(payload, null, 2)
      );
    }
  }

  UI.batchPhaseLabel = batchPhaseLabel;
  for (const name of Object.getOwnPropertyNames(RunMethods.prototype)) {
    if (name === 'constructor') continue;
    Object.defineProperty(
      UI.RedditToolboxApp.prototype,
      name,
      Object.getOwnPropertyDescriptor(RunMethods.prototype, name)
    );
  }
})();
