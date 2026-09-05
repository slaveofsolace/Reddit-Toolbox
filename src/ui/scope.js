(() => {
  'use strict';

  const { Core, Reddit, UI } = globalThis.RedditToolbox;

  class ScopeMethods {
    async scanProfile() {
      if (this.busy) return;
      this.settings = this.readSettingsFromForm();
      this.store.set('settings', this.settings);
      if (!this.settings.includeComments && !this.settings.includePosts) {
        this.setStatus(this.refs.scanStatus, 'Select comments, posts, or both.', 'error');
        return;
      }

      this.busy = true;
      this.refreshControls();
      this.invalidatePlan();
      let scanned = false;
      this.setStatus(this.refs.scanStatus, 'Finding your history…');
      try {
        const scanner = new Reddit.RedditScanner(this.ensureClient(), {
          onProgress: ({ kind, pages, count, after }) => {
            const suffix = after ? '' : ' complete';
            this.setStatus(this.refs.scanStatus, `${kind}: ${count} found across ${pages} page${pages === 1 ? '' : 's'}${suffix}`);
          }
        });
        const result = await scanner.scanProfile({
          includeComments: this.settings.includeComments,
          includePosts: this.settings.includePosts
        });
        if (this.username && !Reddit.sameUsername(this.username, result.username)) this.clearLoadedData();
        this.profileItems = result.items;
        scanned = true;
        this.showAccount(result.username);
        this.coverage = result.report;
        this.invalidatePlan();
        const truncated = [result.report.comments, result.report.posts].some((entry) => entry?.truncated);
        const note = truncated ? ' The listing ended early or reached a limit; import your Reddit archive for older items.' : ' Profile-visible history can omit older items.';
        this.setStatus(this.refs.scanStatus, `Found ${result.items.length} profile items for u/${result.username}.${note}`, 'success');
        this.renderCounts();
      } catch (error) {
        this.setStatus(this.refs.scanStatus, UI.compactError(error), 'error');
      } finally {
        this.busy = false;
        this.refreshControls();
      }
      if (scanned) {
        await this.buildPreview({ refreshSession: false });
        if (this.plan) this.refs.previewSection.scrollIntoView({ block: 'start' });
      }
    }

    async importArchive(fileList) {
      if (this.busy) return;
      const files = Array.from(fileList || []);
      let importedSuccessfully = false;
      if (!files.length) return;
      this.busy = true;
      this.refreshControls();
      try {
        const imported = [];
        const messages = [];
        for (const file of files) {
          const result = await Reddit.importArchiveCsvAsync(await file.text(), file.name, {
            onProgress: (count) => this.setStatus(this.refs.scanStatus, `${file.name}: ${count} rows read locally…`)
          });
          for (const item of result.items) imported.push(item);
          messages.push(`${file.name}: ${result.items.length} accepted, ${result.rejected} rejected, ${result.duplicates} duplicates`);
        }
        this.archiveItems = Reddit.mergeItems(this.archiveItems, imported);
        importedSuccessfully = true;
        this.invalidatePlan();
        this.setStatus(
          this.refs.scanStatus,
          `Archive imported (${messages.join(', ')}). ${this.archiveItems.length} unique archive items available.`,
          'success'
        );
        this.renderCounts();
      } catch (error) {
        this.setStatus(this.refs.scanStatus, `Archive import failed: ${UI.compactError(error)}`, 'error');
      } finally {
        this.busy = false;
        this.refs.archiveInput.value = '';
        this.refreshControls();
      }
      if (importedSuccessfully) {
        await this.buildPreview();
        if (this.plan) this.refs.previewSection.scrollIntoView({ block: 'start' });
      }
    }

    async buildPreview(options = {}) {
      if (this.busy) return;
      this.busy = true;
      this.refreshControls();
      try {
        this.settings = this.readSettingsFromForm();
        this.store.set('settings', this.settings);
        const allItems = this.allItems();
        if (!allItems.length && !this.coverage && !this.archiveItems.length) throw new Error('Find matching items or import an archive first.');
        const client = this.ensureClient();
        let session;
        try { session = options.refreshSession === false ? { username: this.username } : await client.getSession(); }
        catch (error) {
          if (!(error instanceof Core.AuthError) || this.profileItems.length) throw error;
          session = { username: '' };
        }
        if (this.username && session.username && !Reddit.sameUsername(this.username, session.username)) {
          this.clearLoadedData();
          this.showAccount(session.username);
          throw new Error('The Reddit account changed. Scan or import history again for this account.');
        }
        this.showAccount(session.username);
        const selection = Core.selectItems(allItems, {
          ...this.settings,
          keepSubreddits: this.settings.keepSubreddits
        });
        this.plan = Core.createPlan(selection.selected, { ...this.settings, accountId: this.username.toLowerCase() });
        this.plan.selectionSkipped = selection.skipped;
        this.renderPlan();
        this.setStatus(
          this.refs.scanStatus,
          `${selection.selected.length} selected${this.username ? '' : ' for local review; sign in to Reddit, then check login'} · ${Object.values(selection.skipped).reduce((sum, count) => sum + count, 0)} excluded by filters.`,
          'success'
        );
      } catch (error) {
        this.invalidatePlan();
        this.setStatus(this.refs.scanStatus, UI.compactError(error), 'error');
      } finally {
        this.busy = false;
        this.refreshControls();
      }
    }

    invalidatePlan(message = '') {
      this.plan = null;
      this.refs.previewNavigation.hidden = true;
      this.refs.selectedCount.textContent = '0';
      this.refs.commentCount.textContent = '0';
      this.refs.postCount.textContent = '0';
      this.refs.processedCount.textContent = '0';
      this.refs.remainingCount.textContent = '0';
      this.refs.failedCount.textContent = '0';
      this.refs.unconfirmedCount.textContent = '0';
      this.refs.deletedCount.textContent = '0';
      this.refs.skippedCount.textContent = '0';
      this.refs.elapsedTime.textContent = '0s';
      this.refs.currentCount.textContent = '—';
      this.refs.previewCaption.textContent = 'No batch prepared';
      this.refs.currentAction.textContent = 'Ready to run the selected batch automatically.';
      this.refs.progress.max = 1;
      this.refs.progress.value = 0;
      this.refs.retry.disabled = true;
      this.refs.exportBackup.disabled = true;
      this.refs.preview.replaceChildren(Object.assign(document.createElement('div'), {
        className: 'preview-empty',
        textContent: 'Prepare a batch before starting cleanup.'
      }));
      this.setLauncherState('idle');
      if (message) this.setStatus(this.refs.scanStatus, message);
      this.refreshControls();
    }

    renderCounts() {
      this.refs.foundCount.textContent = String(this.allItems().length);
    }

    renderPlan() {
      this.renderCounts();
      const contents = this.plan.items.map((item) => item.content);
      this.refs.selectedCount.textContent = String(contents.length);
      this.refs.commentCount.textContent = String(contents.filter((item) => item.kind === 'comment').length);
      this.refs.postCount.textContent = String(contents.filter((item) => item.kind === 'post').length);
      const editable = contents.filter((item) => item.editable !== false).length;
      const uneditable = contents.length - editable;
      const source = this.profileItems.length && this.archiveItems.length ? 'Combined history'
        : this.archiveItems.length ? 'Archive-imported history' : 'Profile-visible history';
      const incomplete = Object.values(this.coverage || {}).some((entry) => entry?.truncated);
      const bounds = contents.reduce((range, item) => [Math.min(range[0], item.createdAt), Math.max(range[1], item.createdAt)], [Infinity, -Infinity]);
      const span = contents.length ? `${UI.dateLabel(bounds[0])} – ${UI.dateLabel(bounds[1])}` : 'No dates';
      const filters = Core.normalizeFilters(this.settings);
      const preserved = [filters.keepSubreddits.length ? `keep ${filters.keepSubreddits.map((name) => `r/${name}`).join(', ')}` : '',
        filters.keepScoreAtOrAbove !== null ? `keep score ≥ ${filters.keepScoreAtOrAbove}` : '',
        filters.textIncludes ? 'text filter active' : ''].filter(Boolean).join('; ');
      this.refs.previewCaption.textContent = `${source}${incomplete ? ' · listing limited' : ''} · ${span}. ${editable} overwrite then delete${uneditable ? `; ${uneditable} ${this.plan.options.deleteUneditablePosts ? 'direct delete' : 'will skip'}` : ''}.${preserved ? ` Keeping: ${preserved}.` : ''}`;
      this.refs.preview.replaceChildren();
      this.refs.processedCount.textContent = '0';
      this.refs.remainingCount.textContent = String(contents.length);
      this.refs.failedCount.textContent = '0';
      this.refs.unconfirmedCount.textContent = '0';
      this.refs.deletedCount.textContent = '0';
      this.refs.skippedCount.textContent = '0';
      this.refs.elapsedTime.textContent = '0s';
      this.refs.currentCount.textContent = '—';
      this.refs.currentAction.textContent = 'Ready to run the selected batch automatically.';
      this.setStatus(this.refs.runStatus, contents.length
        ? (this.plan.options.accountId ? 'Delete applies to the reviewed selection.' : 'Sign in to Reddit, then check login in More options.')
        : 'No matching items.');

      this.previewPage = 0;
      this.renderPreviewPage(0);
      this.refs.progress.max = Math.max(1, contents.length);
      this.refs.progress.value = 0;
      this.refs.exportBackup.disabled = contents.length === 0;
      this.refs.retry.disabled = true;
      this.setLauncherState('idle');
      this.refreshControls();
    }
    excludeFromPlan(id) {
      if (!this.plan || this.busy || this.plan.startedAt) return;
      const page = this.previewPage;
      this.plan = Core.createPlan(this.plan.items.filter((item) => item.id !== id).map((item) => item.content), this.plan.options);
      this.renderPlan();
      this.renderPreviewPage(page);
      this.setStatus(this.refs.runStatus, 'Item kept. The Delete button now applies to the remaining selection.');
    }

    renderPreviewPage(page = 0) {
      const contents = this.plan?.items || [];
      this.previewPage = Math.min(Math.max(0, page), Math.max(0, Math.ceil(contents.length / 100) - 1));
      this.refs.preview.replaceChildren();
      if (!contents.length) {
        this.refs.preview.append(Object.assign(document.createElement('div'), {
          className: 'preview-empty',
          textContent: 'No items match the current filters.'
        }));
      } else {
        for (const queueItem of this.plan.items.slice(this.previewPage * 100, (this.previewPage + 1) * 100)) {
          const item = queueItem.content;
          const row = document.createElement('div');
          row.className = 'item';
          row.dataset.queueId = queueItem.id;

          const head = document.createElement('div');
          head.className = 'item-head';
          const kind = document.createElement('span');
          kind.className = 'kind';
          kind.textContent = item.kind;
          const subreddit = document.createElement('span');
          subreddit.className = 'subreddit';
          subreddit.textContent = item.subreddit ? `r/${item.subreddit}` : 'Unknown subreddit';
          const date = document.createElement('span');
          date.className = 'date';
          date.textContent = UI.dateLabel(item.createdAt);
          head.append(kind, subreddit, date);

          const snippet = document.createElement('div');
          snippet.className = 'snippet';
          snippet.textContent = item.title || item.text || item.permalink || item.fullname;
          const fullText = document.createElement('details');
          fullText.className = 'item-text';
          const textSummary = document.createElement('summary');
          textSummary.textContent = 'Full text';
          const textBody = document.createElement('div');
          textBody.textContent = [item.title, item.text].filter(Boolean).join('\n\n') || 'No editable text in this record.';
          fullText.append(textSummary, textBody);
          const status = document.createElement('div');
          status.className = `item-status ${queueItem.status}`;
          status.textContent = item.kind === 'post' && !item.editable
            ? (this.plan.options.deleteUneditablePosts ? 'Queued · direct delete (explicitly enabled)' : 'Will skip · direct deletion is disabled')
            : 'Queued · automatic overwrite, verification, and deletion';
          const actions = document.createElement('div');
          actions.className = 'actions';
          if (item.permalink) {
            try {
              const url = new URL(item.permalink, 'https://www.reddit.com');
              if (url.protocol === 'https:' && ['www.reddit.com', 'old.reddit.com', 'new.reddit.com', 'sh.reddit.com'].includes(url.hostname) && !url.username && !url.password) {
                const link = document.createElement('a');
                link.href = url.href;
                link.textContent = 'Open on Reddit';
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                actions.append(link);
              }
            } catch { /* An archive link is optional and never executed. */ }
          }
          const keep = document.createElement('button');
          keep.className = 'button keep-item';
          keep.type = 'button';
          keep.textContent = 'Keep';
          keep.disabled = Boolean(this.busy || this.plan.startedAt);
          keep.addEventListener('click', () => this.excludeFromPlan(queueItem.id));
          actions.append(keep);
          row.append(head, snippet, fullText, status, actions);
          this.refs.preview.append(row);
        }
      }

      this.refs.previewNavigation.hidden = contents.length <= 100;
      this.refs.previewPrevious.disabled = this.previewPage === 0;
      this.refs.previewNext.disabled = (this.previewPage + 1) * 100 >= contents.length;
      this.refs.previewPage.textContent = contents.length ? 'Items ' + (this.previewPage * 100 + 1) + '–' + Math.min(contents.length, (this.previewPage + 1) * 100) + ' of ' + contents.length : '';
      this.refs.preview.scrollTop = 0;
      for (const queueItem of this.plan?.items.slice(this.previewPage * 100, (this.previewPage + 1) * 100) || []) {
        if (queueItem.status !== 'ready') this.updateQueueRow(queueItem);
      }
    }

  }

  for (const name of Object.getOwnPropertyNames(ScopeMethods.prototype)) {
    if (name === 'constructor') continue;
    Object.defineProperty(
      UI.RedditToolboxApp.prototype,
      name,
      Object.getOwnPropertyDescriptor(ScopeMethods.prototype, name)
    );
  }
})();
