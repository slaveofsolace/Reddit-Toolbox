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
      this.setStatus(this.refs.scanStatus, 'Connecting to the signed-in Reddit session…');
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
        this.profileItems = result.items;
        this.username = result.username;
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
    }

    async importArchive(fileList) {
      if (this.busy) return;
      const files = Array.from(fileList || []);
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
    }

    async buildPreview() {
      if (this.busy) return;
      this.busy = true;
      this.refreshControls();
      try {
        this.settings = this.readSettingsFromForm();
        this.store.set('settings', this.settings);
        const allItems = this.allItems();
        if (!allItems.length) throw new Error('Scan your profile or import Reddit archive CSV files first.');
        const session = await this.ensureClient().getSession();
        this.username = session.username;
        const selection = Core.selectItems(allItems, {
          ...this.settings,
          keepSubreddits: this.settings.keepSubreddits
        });
        this.plan = Core.createPlan(selection.selected, { ...this.settings, accountId: this.username.toLowerCase() });
        this.plan.selectionSkipped = selection.skipped;
        this.refs.confirmationInput.value = '';
        this.renderPlan();
        this.setStatus(
          this.refs.scanStatus,
          `${selection.selected.length} queued for one automated batch; ${Object.values(selection.skipped).reduce((sum, count) => sum + count, 0)} excluded by filters.`,
          'success'
        );
      } catch (error) {
        this.setStatus(this.refs.scanStatus, UI.compactError(error), 'error');
      } finally {
        this.busy = false;
        this.refreshControls();
      }
    }

    invalidatePlan(message = '') {
      this.plan = null;
      this.refs.confirmationInput.value = '';
      this.refs.confirmationPhrase.textContent = 'DELETE 0 ITEMS';
      this.refs.selectedCount.textContent = '0';
      this.refs.commentCount.textContent = '0';
      this.refs.postCount.textContent = '0';
      this.refs.processedCount.textContent = '0';
      this.refs.remainingCount.textContent = '0';
      this.refs.failedCount.textContent = '0';
      this.refs.deletedCount.textContent = '0';
      this.refs.skippedCount.textContent = '0';
      this.refs.elapsedTime.textContent = '0s';
      this.refs.currentCount.textContent = '—';
      this.refs.previewCaption.textContent = 'No batch prepared';
      this.refs.currentAction.textContent = 'Ready to run the selected batch automatically.';
      this.refs.progress.max = 1;
      this.refs.progress.value = 0;
      this.refs.retry.disabled = true;
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
      this.refs.previewCaption.textContent = `u/${this.plan.options.accountId} · ${source}${incomplete ? ' (listing limited)' : ''}. ${editable} overwrite then delete; ${uneditable} ${this.plan.options.deleteUneditablePosts ? 'direct delete' : 'will skip'}. ${span}; ${filters.sortOrder} first. ${preserved}. Lifetime completeness is not established.`;
      this.refs.confirmationPhrase.textContent = this.plan.confirmation;
      this.refs.preview.replaceChildren();
      this.refs.processedCount.textContent = '0';
      this.refs.remainingCount.textContent = String(contents.length);
      this.refs.failedCount.textContent = '0';
      this.refs.deletedCount.textContent = '0';
      this.refs.skippedCount.textContent = '0';
      this.refs.elapsedTime.textContent = '0s';
      this.refs.currentCount.textContent = '—';
      this.refs.currentAction.textContent = 'Ready to run the selected batch automatically.';
      this.setStatus(this.refs.runStatus, contents.length
        ? `Ready · one confirmation will process all ${contents.length} selected items.`
        : 'No matching items.');

      if (!contents.length) {
        this.refs.preview.append(Object.assign(document.createElement('div'), {
          className: 'preview-empty',
          textContent: 'No items match the current filters.'
        }));
      } else {
        for (const queueItem of this.plan.items.slice(0, 100)) {
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
          const status = document.createElement('div');
          status.className = `item-status ${queueItem.status}`;
          status.textContent = item.kind === 'post' && !item.editable
            ? (this.plan.options.deleteUneditablePosts ? 'Queued · direct delete (explicitly enabled)' : 'Will skip · direct deletion is disabled')
            : 'Queued · automatic overwrite, verification, and deletion';
          row.append(head, snippet, status);
          this.refs.preview.append(row);
        }
        if (contents.length > 100) {
          this.refs.preview.append(Object.assign(document.createElement('div'), {
            className: 'preview-empty',
            textContent: `${contents.length - 100} more items are included in this batch.`
          }));
        }
      }
      this.refs.progress.max = Math.max(1, contents.length);
      this.refs.progress.value = 0;
      this.refs.exportBackup.disabled = contents.length === 0;
      this.refs.retry.disabled = true;
      this.setLauncherState('idle');
      this.refreshControls();
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
