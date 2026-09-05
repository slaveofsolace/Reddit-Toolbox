(() => {
  'use strict';

  const { Core, Reddit, UI } = globalThis.RedditToolbox;

  class RedditToolboxApp {
    constructor(options = {}) {
      this.store = options.store || new Core.SettingsStore();
      this.client = options.client || null;
      this.host = null;
      this.shadow = null;
      this.refs = {};
      this.profileItems = [];
      this.archiveItems = [];
      this.coverage = null;
      this.removalServices = new Map();
      this.plan = null;
      this.runner = null;
      this.removalService = null;
      this.removalServiceClient = null;
      this.username = '';
      this.logLines = [];
      this.busy = false;
      this.previewPage = 0;
      this.completionResetTimer = null;
      this.previewRebuildTimer = null;
      this.beforeUnloadHandler = (event) => {
        const state = this.runner?.state;
        if (!['running', 'waiting', 'paused', 'stopping'].includes(state)) return;
        event.preventDefault();
        event.returnValue = '';
      };
      const saved = this.store.get('settings', {}) || {};
      this.settings = Object.fromEntries(Object.entries(UI.DEFAULT_SETTINGS).map(([key, value]) => [key, saved[key] ?? value]));
    }

    mount() {
      if (this.host || !document.body) return this;
      this.host = document.createElement('div');
      this.host.id = 'reddit-toolbox-host';
      this.shadow = this.host.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = UI.styles;
      this.shadow.append(style);
      const shell = document.createElement('div');
      shell.innerHTML = UI.staticMarkup;
      this.shadow.append(shell);
      document.body.append(this.host);
      this.captureRefs();
      this.writeSettingsToForm();
      this.store.remove?.('oauth-client-id');
      this.refs.canonicalLink.hidden = globalThis.location?.origin === 'https://www.reddit.com';
      this.window = new UI.ToolboxWindow(this);
      this.bindEvents();
      this.updateDateFields();
      this.refreshControls();
      this.setLauncherState('idle');
      globalThis.addEventListener?.('beforeunload', this.beforeUnloadHandler);
      return this;
    }

    captureRefs() {
      const $ = (selector) => this.shadow.querySelector(selector);
      this.refs = {
        launcher: $('.launcher'), launcherLabel: $('.launcher-label'), launcherBadge: $('.launcher-badge'),
        panel: $('.panel'), close: $('.close'),
        accountStatus: $('.account-status'), checkLogin: $('.check-login'), clearHistory: $('.clear-history'), canonicalLink: $('.canonical-link'),
        previewNavigation: $('.preview-navigation'), previewPrevious: $('.preview-previous'), previewNext: $('.preview-next'), previewPage: $('.preview-page'),
        includeComments: $('#include-comments'), includePosts: $('#include-posts'),
        dateMode: $('#date-mode'), fromDate: $('#from-date'), throughDate: $('#through-date'),
        fromField: $('.from-field'), throughField: $('.through-field'), maxItems: $('#max-items'),
        sortOrder: $('#sort-order'), keepSubreddits: $('#keep-subreddits'), keepScore: $('#keep-score'),
        textIncludes: $('#text-includes'), deleteUneditable: $('#delete-uneditable'),
        minimumDelay: $('#minimum-delay'), maximumDelay: $('#maximum-delay'),
        scan: $('.scan'), importButton: $('.import'), archiveInput: $('.archive-input'),
        scanStatus: $('.scan-status'), previewSection: $('.preview-section'), runSection: $('.run-section'),
        foundCount: $('.found-count'), selectedCount: $('.selected-count'),
        commentCount: $('.comment-count'), postCount: $('.post-count'),
        previewCaption: $('.preview-caption'), preview: $('.preview'),
        exportBackup: $('.export-backup'), exportLog: $('.export-log'),
        batchSummary: $('.batch-summary'), runDetails: $('.run-details'), deleteNote: $('.delete-note'), unconfirmedCount: $('.unconfirmed-count'), recheck: $('.recheck'),
        processedCount: $('.processed-count'), remainingCount: $('.remaining-count'),
        failedCount: $('.failed-count'), currentCount: $('.current-count'),
        deletedCount: $('.deleted-count'), skippedCount: $('.skipped-count'), elapsedTime: $('.elapsed-time'),
        currentAction: $('.current-action'), progress: $('.progress'), runStatus: $('.run-status'),
        start: $('.start'), pause: $('.pause'), stop: $('.stop'), retry: $('.retry'), log: $('.log')
      };
    }

    bindEvents() {
      this.refs.launcher.addEventListener('click', () => this.toggle());
      this.refs.close.addEventListener('click', () => this.close());
      this.refs.checkLogin.addEventListener('click', () => this.checkLogin());
      this.refs.clearHistory.addEventListener('click', () => this.clearHistory());
      this.refs.previewPrevious.addEventListener('click', () => this.renderPreviewPage(this.previewPage - 1));
      this.refs.previewNext.addEventListener('click', () => this.renderPreviewPage(this.previewPage + 1));
      this.shadow.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && this.refs.panel.classList.contains('open')) this.close();
      });
      this.refs.dateMode.addEventListener('change', () => this.updateDateFields());
      this.refs.scan.addEventListener('click', () => this.scanProfile());
      this.refs.importButton.addEventListener('click', () => this.refs.archiveInput.click());
      this.refs.archiveInput.addEventListener('change', (event) => this.importArchive(event.target.files));
      this.refs.exportBackup.addEventListener('click', () => this.exportBackup());
      this.refs.exportLog.addEventListener('click', () => this.exportLog());
      this.refs.recheck.addEventListener('click', () => this.recheckResults());
      this.refs.start.addEventListener('click', () => this.startRun());
      this.refs.pause.addEventListener('click', () => this.togglePause());
      this.refs.stop.addEventListener('click', () => this.stopRun());
      this.refs.retry.addEventListener('click', () => this.prepareRetryBatch());

      for (const input of this.shadow.querySelectorAll('input, select')) {
        if (input === this.refs.archiveInput) continue;
        const changed = () => {
          if (this.busy) return;
          const nextSettings = this.readSettingsFromForm();
          if (JSON.stringify(nextSettings) === JSON.stringify(this.settings)) return;
          this.settings = nextSettings;
          this.store.set('settings', this.settings);
          this.invalidatePlan();
          clearTimeout(this.previewRebuildTimer);
          if (this.allItems().length) this.previewRebuildTimer = setTimeout(() => this.buildPreview({ refreshSession: false }), 180);
        };
        input.addEventListener('change', changed);
        input.addEventListener('input', changed);
      }
    }

    open() {
      this.refs.panel.classList.add('open');
      this.window?.apply();
      this.refs.launcher.setAttribute('aria-expanded', 'true');
      this.refs.close.focus();
    }

    close() {
      this.refs.panel.classList.remove('open');
      this.refs.launcher.setAttribute('aria-expanded', 'false');
      this.refs.launcher.focus();
    }

    toggle() {
      if (this.refs.panel.classList.contains('open')) this.close(); else this.open();
    }

    writeSettingsToForm() {
      const settings = this.settings;
      this.refs.includeComments.checked = settings.includeComments;
      this.refs.includePosts.checked = settings.includePosts;
      this.refs.dateMode.value = settings.dateMode;
      this.refs.fromDate.value = settings.fromDate;
      this.refs.throughDate.value = settings.throughDate;
      this.refs.maxItems.value = settings.maxItems || '';
      this.refs.sortOrder.value = settings.sortOrder;
      this.refs.keepSubreddits.value = settings.keepSubreddits;
      this.refs.keepScore.value = settings.keepScoreAtOrAbove;
      this.refs.textIncludes.value = settings.textIncludes;
      this.refs.deleteUneditable.checked = settings.deleteUneditablePosts;
      this.refs.minimumDelay.value = settings.minimumDelaySeconds;
      this.refs.maximumDelay.value = settings.maximumDelaySeconds;
    }

    readSettingsFromForm() {
      const minimumDelaySeconds = Math.min(300, Math.max(1, Number(this.refs.minimumDelay.value) || 4.5));
      const maximumDelaySeconds = Math.min(
        300,
        Math.max(minimumDelaySeconds, Number(this.refs.maximumDelay.value) || 8.5)
      );
      return {
        includeComments: this.refs.includeComments.checked,
        includePosts: this.refs.includePosts.checked,
        dateMode: this.refs.dateMode.value,
        fromDate: this.refs.fromDate.value,
        throughDate: this.refs.throughDate.value,
        maxItems: Math.max(0, Number(this.refs.maxItems.value) || 0),
        sortOrder: this.refs.sortOrder.value,
        keepSubreddits: this.refs.keepSubreddits.value,
        keepScoreAtOrAbove: this.refs.keepScore.value,
        textIncludes: this.refs.textIncludes.value,
        deleteUneditablePosts: this.refs.deleteUneditable.checked,
        verifyOverwrite: true,
        replacementLength: 24,
        minimumDelaySeconds,
        maximumDelaySeconds,
        continueOnFailure: true,
        maxConsecutiveFailures: 5
      };
    }

    updateDateFields() {
      const mode = this.refs.dateMode.value;
      this.refs.fromField.classList.toggle('hidden', !['after', 'between'].includes(mode));
      this.refs.throughField.classList.toggle('hidden', !['before', 'between'].includes(mode));
    }

    allItems() {
      const completed = this.removalServices.get(this.username.toLowerCase())?.states;
      return Reddit.mergeItems(this.profileItems, this.archiveItems).filter(item => !completed?.get(item.fullname)?.completed);
    }

    ensureClient() {
      if (!this.client) this.client = new Reddit.RedditSessionClient();
      return this.client;
    }

    async checkLogin() {
      if (this.busy) return;
      this.busy = true;
      this.refreshControls();
      this.setStatus(this.refs.accountStatus, 'Checking this tab’s Reddit login…');
      let checked = false;
      try {
        const session = await this.ensureClient().getSession();
        if (this.username && !Reddit.sameUsername(this.username, session.username)) this.clearLoadedData();
        this.showAccount(session.username);
        checked = true;
      } catch (error) {
        this.invalidatePlan();
        this.setStatus(this.refs.accountStatus, UI.compactError(error), 'error');
      } finally {
        this.busy = false;
        this.refreshControls();
      }
      if (checked && !this.plan?.startedAt && (this.profileItems.length || this.archiveItems.length)) await this.buildPreview({ refreshSession: false });
    }

    showAccount(username) {
      this.username = username;
      this.setStatus(this.refs.accountStatus, username ? 'Signed in as u/' + username : 'Local review · sign in to Reddit, then check login.', username ? 'success' : '');
    }

    clearLoadedData() {
      this.profileItems = [];
      this.archiveItems = [];
      this.coverage = null;
      this.invalidatePlan();
      this.renderCounts();
    }

    clearHistory() {
      if (this.busy) return;
      this.clearLoadedData();
      this.setStatus(this.refs.scanStatus, 'Loaded history cleared.');
    }

    setStatus(element, message, tone = '') {
      element.textContent = message;
      element.classList.toggle('error', tone === 'error');
      element.classList.toggle('success', tone === 'success');
    }
  }

  UI.RedditToolboxApp = RedditToolboxApp;
})();
