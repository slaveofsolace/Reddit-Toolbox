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
      this.plan = null;
      this.runner = null;
      this.removalService = null;
      this.removalServiceClient = null;
      this.username = '';
      this.logLines = [];
      this.busy = false;
      this.completionResetTimer = null;
      this.beforeUnloadHandler = (event) => {
        const state = this.runner?.state;
        if (!['running', 'waiting', 'paused', 'stopping'].includes(state)) return;
        event.preventDefault();
        event.returnValue = '';
      };
      this.settings = { ...UI.DEFAULT_SETTINGS, ...(this.store.get('settings', {}) || {}) };
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
        includeComments: $('#include-comments'), includePosts: $('#include-posts'),
        dateMode: $('#date-mode'), fromDate: $('#from-date'), throughDate: $('#through-date'),
        fromField: $('.from-field'), throughField: $('.through-field'), maxItems: $('#max-items'),
        sortOrder: $('#sort-order'), keepSubreddits: $('#keep-subreddits'), keepScore: $('#keep-score'),
        textIncludes: $('#text-includes'), deleteUneditable: $('#delete-uneditable'),
        replacementLength: $('#replacement-length'),
        minimumDelay: $('#minimum-delay'), maximumDelay: $('#maximum-delay'),
        scan: $('.scan'), importButton: $('.import'), archiveInput: $('.archive-input'),
        buildPreview: $('.build-preview'), scanStatus: $('.scan-status'),
        foundCount: $('.found-count'), selectedCount: $('.selected-count'),
        commentCount: $('.comment-count'), postCount: $('.post-count'),
        previewCaption: $('.preview-caption'), preview: $('.preview'),
        exportBackup: $('.export-backup'), exportLog: $('.export-log'),
        confirmationPhrase: $('.confirmation-phrase'), confirmationInput: $('.confirmation-input'),
        processedCount: $('.processed-count'), remainingCount: $('.remaining-count'),
        failedCount: $('.failed-count'), currentCount: $('.current-count'),
        currentAction: $('.current-action'), progress: $('.progress'), runStatus: $('.run-status'),
        start: $('.start'), pause: $('.pause'), stop: $('.stop'), retry: $('.retry'), log: $('.log')
      };
    }

    bindEvents() {
      this.refs.launcher.addEventListener('click', () => this.toggle());
      this.refs.close.addEventListener('click', () => this.close());
      this.shadow.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && this.refs.panel.classList.contains('open')) this.close();
      });
      this.refs.dateMode.addEventListener('change', () => this.updateDateFields());
      this.refs.scan.addEventListener('click', () => this.scanProfile());
      this.refs.importButton.addEventListener('click', () => this.refs.archiveInput.click());
      this.refs.archiveInput.addEventListener('change', (event) => this.importArchive(event.target.files));
      this.refs.buildPreview.addEventListener('click', () => this.buildPreview());
      this.refs.exportBackup.addEventListener('click', () => this.exportBackup());
      this.refs.exportLog.addEventListener('click', () => this.exportLog());
      this.refs.confirmationInput.addEventListener('input', () => this.refreshControls());
      this.refs.start.addEventListener('click', () => this.startRun());
      this.refs.pause.addEventListener('click', () => this.togglePause());
      this.refs.stop.addEventListener('click', () => this.stopRun());
      this.refs.retry.addEventListener('click', () => this.prepareRetryBatch());

      for (const input of this.shadow.querySelectorAll('input, select')) {
        if (input === this.refs.archiveInput || input === this.refs.confirmationInput) continue;
        input.addEventListener('change', () => {
          this.settings = this.readSettingsFromForm();
          this.store.set('settings', this.settings);
          if (this.plan) this.invalidatePlan('Settings changed. Prepare the batch again.');
        });
      }
    }

    open() {
      this.refs.panel.classList.add('open');
      this.refs.close.focus();
    }

    close() {
      this.refs.panel.classList.remove('open');
      this.refs.launcher.focus();
    }

    toggle() {
      this.refs.panel.classList.toggle('open');
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
      this.refs.replacementLength.value = settings.replacementLength;
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
        replacementLength: Math.max(8, Math.min(128, Number(this.refs.replacementLength.value) || 24)),
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
      return Reddit.mergeItems(this.profileItems, this.archiveItems);
    }

    ensureClient() {
      this.client ||= new Reddit.RedditSessionClient();
      return this.client;
    }

    setStatus(element, message, tone = '') {
      element.textContent = message;
      element.classList.toggle('error', tone === 'error');
      element.classList.toggle('success', tone === 'success');
    }
  }

  UI.RedditToolboxApp = RedditToolboxApp;
})();
