(() => {
  'use strict';

  const { Core, Reddit, UI } = globalThis.RedditToolbox;

  class RunMethods {
    refreshControls() {
      const active = this.runner && ['running', 'paused'].includes(this.runner.state);
      const locked = Boolean(active || this.busy);
      const confirmed = Boolean(
        this.plan
        && this.plan.items.length
        && Core.isPlanCurrent(this.plan)
        && this.refs.confirmationInput.value.trim() === this.plan.confirmation
      );
      this.refs.start.disabled = active || !confirmed;
      this.refs.pause.disabled = !active;
      this.refs.stop.disabled = !active;
      this.refs.pause.textContent = this.runner?.state === 'paused' ? 'Resume' : 'Pause';
      this.refs.exportLog.disabled = !this.plan || !this.plan.items.some((item) => item.status !== 'ready');

      for (const element of this.shadow.querySelectorAll('.scope-section input, .scope-section select, .scope-section button')) {
        element.disabled = locked;
      }
    }

    log(message) {
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      this.logLines.push(`${time}  ${message}`);
      this.logLines = this.logLines.slice(-120);
      this.refs.log.textContent = this.logLines.join('\n');
      this.refs.log.scrollTop = this.refs.log.scrollHeight;
    }

    updateQueueRow(queueItem) {
      const row = Array.from(this.refs.preview.querySelectorAll('.item'))
        .find((candidate) => candidate.dataset.queueId === queueItem.id);
      const status = row?.querySelector('.item-status');
      if (!status) return;
      status.className = `item-status ${queueItem.status}`;
      const detail = queueItem.error?.message || queueItem.outcome?.reason || queueItem.status;
      status.textContent = `${queueItem.status} · ${detail}`;
    }

    handleRunnerEvent(event) {
      const summary = this.plan ? Core.planSummary(this.plan) : { total: 0, completed: 0, skipped: 0, failed: 0 };
      const finished = summary.completed + summary.skipped + summary.failed + summary.stopped;
      this.refs.progress.value = Math.min(summary.total, finished);
      if (event.queueItem) this.updateQueueRow(event.queueItem);

      switch (event.type) {
        case 'run-started': this.log(`Run started with ${event.plan.items.length} items.`); break;
        case 'item-started': this.log(`Processing ${event.queueItem.content.fullname}.`); break;
        case 'item-finished': this.log(`${event.queueItem.content.fullname}: ${event.queueItem.outcome.reason}.`); break;
        case 'item-failed': this.log(`${event.queueItem.content.fullname}: failed — ${UI.compactError(event.error)}.`); break;
        case 'item-retry': this.log(`${event.queueItem.content.fullname}: retrying after ${Math.ceil(event.delayMs / 1000)}s.`); break;
        case 'rate-limited': this.log(`Reddit rate limit: waiting ${Math.ceil(event.delayMs / 1000)}s.`); break;
        case 'attention-required': this.log(`Paused: ${UI.compactError(event.error)}`); break;
        case 'paused': this.log(event.reason); break;
        case 'resumed': this.log('Run resumed.'); break;
        case 'stop-requested': this.log('Stop requested; the current request will finish first.'); break;
        case 'run-stopped': this.log('Run stopped.'); break;
        case 'run-completed': this.log('Run completed.'); break;
        default: break;
      }

      this.setStatus(
        this.refs.runStatus,
        `${finished}/${summary.total} finished · ${summary.completed} deleted · ${summary.skipped} skipped · ${summary.failed} failed`
      );
      this.refreshControls();
    }

    async startRun() {
      if (!this.plan || !Core.isPlanCurrent(this.plan)) {
        this.setStatus(this.refs.runStatus, 'The plan changed. Build a new preview.', 'error');
        return;
      }
      if (this.refs.confirmationInput.value.trim() !== this.plan.confirmation) return;

      this.settings = this.readSettingsFromForm();
      this.busy = true;
      this.logLines = [];
      this.refs.log.textContent = '';
      this.refs.confirmationInput.value = '';
      try {
        const client = this.ensureClient();
        const session = await client.getSession(true);
        this.username = session.username;
        const service = new Reddit.RedditRemovalService(client, {
          ...this.plan.options,
          randomSource: globalThis.crypto
        });
        this.runner = new Core.ControlledRunner((item) => service.remove(item), {
          minimumDelayMs: this.settings.minimumDelaySeconds * 1_000,
          maximumDelayMs: this.settings.maximumDelaySeconds * 1_000,
          maxRetries: 2,
          onEvent: (event) => this.handleRunnerEvent(event)
        });
        this.refreshControls();
        await this.runner.run(this.plan);
        const summary = Core.planSummary(this.plan);
        this.setStatus(
          this.refs.runStatus,
          `${summary.completed} deleted, ${summary.skipped} skipped, ${summary.failed} failed.`,
          summary.failed ? 'error' : 'success'
        );
      } catch (error) {
        this.setStatus(this.refs.runStatus, UI.compactError(error), 'error');
        this.log(`Run could not start: ${UI.compactError(error)}`);
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

    exportBackup() {
      if (!this.plan) return;
      const payload = {
        exportedAt: new Date().toISOString(),
        username: this.username || null,
        planId: this.plan.id,
        planDigest: this.plan.digest,
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
        summary: Core.planSummary(this.plan),
        items: this.plan.items.map((item) => ({
          fullname: item.content.fullname,
          kind: item.content.kind,
          subreddit: item.content.subreddit,
          permalink: item.content.permalink,
          createdAt: new Date(item.content.createdAt).toISOString(),
          status: item.status,
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

  for (const name of Object.getOwnPropertyNames(RunMethods.prototype)) {
    if (name === 'constructor') continue;
    Object.defineProperty(
      UI.RedditToolboxApp.prototype,
      name,
      Object.getOwnPropertyDescriptor(RunMethods.prototype, name)
    );
  }
})();
