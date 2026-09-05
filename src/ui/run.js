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
    'verifying-deletion': 'Waiting for Reddit to confirm deletion',
    'retrying-delete': 'Retrying a deletion that Reddit has not applied',
    unconfirmed: 'Needs recheck',
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
      const summary = active ? this.runner.progress().summary : Core.planSummary(this.plan);
      const confirmed = Boolean(
        !locked && this.plan?.options.accountId
        && summary.ready > 0
        && Core.isPlanCurrent(this.plan)
      );
      this.refs.start.disabled = locked || !confirmed;
      this.refs.start.hidden = !this.plan || Boolean(this.plan.startedAt);
      this.refs.start.textContent = this.plan?.options.accountId ? `Delete ${summary.ready} ${summary.ready === 1 ? 'item' : 'items'}` : 'Sign in to delete';
      this.refs.pause.hidden = !active;
      this.refs.stop.hidden = !active && !this.rechecking;
      this.refs.stop.textContent = this.rechecking ? 'Cancel recheck' : 'Stop';
      this.refs.stop.title = this.rechecking ? 'Cancel read-only verification' : 'Finish the current item, then stop';
      this.refs.retry.hidden = active || !(summary.failed || summary.stopped);
      this.refs.recheck.hidden = active || !summary.unconfirmed;
      this.refs.recheck.disabled = locked;
      this.refs.runSection.hidden = !this.plan;
      this.refs.previewSection.hidden = !this.plan;
      this.refs.batchSummary.hidden = !this.plan?.startedAt;
      this.refs.runDetails.hidden = !this.plan?.startedAt;
      this.refs.currentAction.hidden = !this.plan?.startedAt;
      this.refs.progress.hidden = !this.plan?.startedAt;
      this.refs.deleteNote.hidden = !this.plan?.options.accountId || Boolean(this.plan.startedAt);
      this.refs.scan.textContent = this.busy && !active ? 'Working…' : this.profileItems.length ? 'Refresh history' : 'Find matching items';
      this.refs.pause.disabled = !active || this.runner?.state === 'stopping';
      this.refs.stop.disabled = this.rechecking ? this.recheckCancelled : !active || this.runner?.state === 'stopping';
      this.refs.retry.disabled = locked || !(summary.failed || summary.stopped);
      this.refs.pause.textContent = this.runner?.state === 'paused' ? 'Resume' : 'Pause';
      this.refs.checkLogin.disabled = locked;
      this.refs.clearHistory.disabled = locked;
      this.refs.exportLog.disabled = !this.plan || !this.plan.items.some((item) => item.status !== 'ready');

      for (const element of this.shadow.querySelectorAll('.scope-section input, .scope-section select, .scope-section button')) {
        element.disabled = locked;
      }
      for (const element of this.refs.preview.querySelectorAll('.keep-item')) element.disabled = locked || Boolean(this.plan?.startedAt);
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
      if (state === 'completed' || state === 'completed-with-failures') {
        this.refs.launcher.classList.add((current.failed || current.unconfirmed) ? 'failed' : 'completed');
        this.refs.launcherLabel.textContent = (current.failed || current.unconfirmed) ? '!' : '✓';
        this.refs.launcher.title = current.unconfirmed ? 'Cleanup finished with results to recheck' : current.failed ? 'Batch completed with failures' : 'Batch completed';
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
      status.textContent = queueItem.status === 'completed' ? 'Deleted' : queueItem.status === 'unconfirmed' ? 'Needs recheck · not counted as deleted' : `${queueItem.status} · ${detail}`;
      if (queueItem.status === 'completed') row.querySelector('.snippet').textContent = 'Deleted from Reddit';
    }

    updateBatchMetrics(event) {
      const summary = event.summary || (this.plan ? Core.planSummary(this.plan) : Core.planSummary(null));
      this.refs.progress.max = Math.max(1, summary.total);
      this.refs.progress.value = summary.processed;
      this.refs.processedCount.textContent = String(summary.processed);
      this.refs.remainingCount.textContent = String(summary.remaining);
      this.refs.failedCount.textContent = String(summary.failed);
      this.refs.unconfirmedCount.textContent = String(summary.unconfirmed);
      this.refs.deletedCount.textContent = String(summary.completed);
      this.refs.skippedCount.textContent = String(summary.skipped);
      const started = this.plan?.startedAt ? new Date(this.plan.startedAt).getTime() : Date.now();
      this.refs.elapsedTime.textContent = `${Math.max(0, Math.floor((Date.now() - started) / 1000))}s`;
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
          this.log(`Item ${event.index + 1}/${event.total} started.`);
          this.refs.currentAction.textContent = `Item ${event.index + 1}/${event.total} · starting`;
          break;
        case 'item-phase':
          this.refs.currentAction.textContent = `Item ${event.index + 1}/${event.total} · ${batchPhaseLabel(event.phase)}`;
          break;
        case 'item-finished':
          this.log(`Item ${event.index + 1}/${event.total}: ${event.queueItem.outcome.reason}.`);
          break;
        case 'item-unconfirmed':
          this.log(`Item ${event.index + 1}/${event.total}: deletion needs a later recheck. Continuing with the next item.`);
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
          if (event.state === 'paused') break;
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
          this.refs.currentAction.textContent = (summary.failed || summary.unconfirmed)
            ? 'Cleanup finished. Review the remaining results below.'
            : 'Batch complete.';
          break;
        default:
          break;
      }

      const status = event.state === 'paused'
        ? `Paused · ${summary.processed}/${summary.total} processed · ${summary.remaining} remaining`
        : event.state === 'stopping'
          ? `Stopping · ${summary.processed}/${summary.total} processed · ${summary.remaining} remaining`
          : `${summary.processed}/${summary.total} processed · ${summary.completed} deleted · ${summary.skipped} skipped · ${summary.failed} failed · ${summary.unconfirmed} need recheck`;
      this.setStatus(this.refs.runStatus, status, summary.failed || summary.unconfirmed ? 'error' : '');
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

      this.settings = this.readSettingsFromForm();
      const expectedOptions = { ...this.settings, accountId: this.plan.options.accountId };
      if (Core.planDigest(this.plan.items.map((item) => item.content), expectedOptions) !== this.plan.digest || !this.plan.options.accountId) {
        this.invalidatePlan('The account or settings need a fresh review. Prepare the batch again.');
        return;
      }
      this.busy = true;
      this.refreshControls();
      this.logLines = [];
      this.refs.log.textContent = '';
      this.setStatus(this.refs.runStatus, 'Verifying the Reddit session before starting…');
      try {
        const client = this.ensureClient();
        // The worker validates the account before every mutation. Keeping that
        // validation inside the runner also gives it automatic rate-limit waits.
        const serviceKey = this.plan.options.accountId;
        let service = this.removalServices.get(serviceKey);
        if (!service || service.client !== client) {
          service = new Reddit.RedditRemovalService(client, {
            ...this.plan.options,
            expectedUsername: this.plan.options.accountId,
            randomSource: globalThis.crypto
          });
          this.removalServices.set(serviceKey, service);
        }
        service.deleteUneditablePosts = this.plan.options.deleteUneditablePosts;
        service.replacementLength = this.plan.options.replacementLength;
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
        this.renderCounts();
        const message = summary.stopped
          ? `${summary.completed} deleted; ${summary.unconfirmed} need recheck; ${summary.stopped} remaining items stopped.`
          : summary.unconfirmed
            ? `${summary.completed} deleted; ${summary.unconfirmed} need recheck; ${summary.failed} failed. Cleanup finished.`
          : summary.failed
            ? `${summary.completed} deleted; ${summary.failed} failed items can be retried as one batch.`
            : `${summary.completed} deleted, ${summary.skipped} skipped. Automated batch complete.`;
        this.setStatus(
          this.refs.runStatus,
          message,
          summary.failed || summary.stopped || summary.unconfirmed ? 'error' : 'success'
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
        this.runner.resume();
      } else {
        this.runner.pause();
      }
      this.refreshControls();
    }

    stopRun() {
      if (this.rechecking) {
        this.recheckCancelled = true;
        this.refs.currentAction.textContent = 'Cancelling the recheck…';
        this.refreshControls();
        return;
      }
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
      this.renderPlan();
      this.setStatus(
        this.refs.runStatus,
        `Retry batch prepared with ${retry.items.length} items. Review the remaining items, then use Delete.`
      );
      this.open();
    }

    async recheckResults() {
      if (this.busy || !this.plan || !this.removalService) return;
      this.busy = true;
      this.rechecking = true;
      this.recheckCancelled = false;
      this.refreshControls();
      try {
        const service = this.removalService;
        const rows = this.plan.items.filter(item => item.status === 'unconfirmed');
        for (const [index, row] of rows.entries()) {
          if (this.recheckCancelled) break;
          while (!this.recheckCancelled) {
            this.refs.currentAction.textContent = `Rechecking result ${index + 1}/${rows.length} · read only`;
            try {
              await service.verifyDeleted(row.content, service.stateFor(row.content.fullname), {
                isStopRequested: () => this.recheckCancelled
              }, false);
              row.status = 'completed';
              row.phase = 'completed';
              row.error = null;
              row.outcome = { status: 'completed', reason: 'deletion-confirmed', deleted: true };
              break;
            } catch (error) {
              if (error?.code === 'RATE_LIMITED') {
                const until = Date.now() + Math.max(1_000, Number(error.retryAfterMs) || 60_000);
                while (!this.recheckCancelled && Date.now() < until) {
                  this.refs.currentAction.textContent = `Reddit cooldown · recheck continues in ${secondsLabel(until - Date.now())}`;
                  await Core.wait(Math.min(1_000, until - Date.now()));
                }
                continue;
              }
              row.error = { code: error.code, message: UI.compactError(error) };
              if (error?.pauseRequired) {
                this.recheckCancelled = true;
                this.log(`Recheck stopped: ${UI.compactError(error)}`);
              }
              break;
            }
          }
          this.updateQueueRow(row);
          this.updateBatchMetrics({ summary: Core.planSummary(this.plan) });
        }
        const summary = Core.planSummary(this.plan);
        if (this.runner) this.runner.summary = { ...summary };
        this.plan.status = summary.stopped ? 'stopped' : summary.failed || summary.unconfirmed ? 'completed-with-failures' : 'completed';
        if (this.runner) this.runner.state = this.plan.status;
        this.updateBatchMetrics({ summary });
        this.renderCounts();
        this.refs.currentAction.textContent = this.recheckCancelled ? 'Recheck stopped.' : 'Recheck complete.';
        this.setStatus(this.refs.runStatus, `${summary.completed} deleted; ${summary.unconfirmed} need recheck${summary.stopped ? `; ${summary.stopped} remaining items stopped` : ''}.`, summary.unconfirmed || summary.failed ? 'error' : 'success');
        this.setLauncherState(this.plan.status, summary);
      } finally {
        this.rechecking = false;
        this.busy = false;
        this.refreshControls();
      }
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
        mode: this.plan.mode,
        summary: Core.planSummary(this.plan),
        items: this.plan.items.map((item, index) => ({
          item: index + 1,
          kind: item.content.kind,
          status: item.status,
          phase: item.phase,
          attempts: item.attempts,
          outcome: item.outcome,
          error: item.error ? { code: item.error.code } : null
        }))
      };
      Core.downloadText(
        `reddit-toolbox-log-${Date.now()}.json`,
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
