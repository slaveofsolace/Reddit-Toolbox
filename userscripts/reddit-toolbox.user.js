// ==UserScript==
// @name         Reddit Toolbox
// @namespace    https://github.com/slaveofsolace
// @version      1.0.0-rc.6
// @description  Automatically overwrite and delete selected Reddit posts and comments in one reviewed batch.
// @author       slaveofsolace
// @license      MIT
// @match        https://www.reddit.com/*
// @match        https://old.reddit.com/*
// @match        https://new.reddit.com/*
// @match        https://sh.reddit.com/*
// @run-at       document-idle
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @homepageURL  https://github.com/slaveofsolace/Reddit-Toolbox
// @supportURL   https://github.com/slaveofsolace/Reddit-Toolbox/issues
// @downloadURL  https://raw.githubusercontent.com/slaveofsolace/Reddit-Toolbox/main/userscripts/reddit-toolbox.user.js
// @updateURL    https://raw.githubusercontent.com/slaveofsolace/Reddit-Toolbox/main/userscripts/reddit-toolbox.user.js
// ==/UserScript==

/* src/core/namespace.js */
(() => {
  'use strict';

  const family = globalThis.ToolboxFamily || {};
  family.Core ||= {};
  family.version = '1.0.0-rc.6';

  const toolbox = globalThis.RedditToolbox || {};
  toolbox.Core = family.Core;
  toolbox.Reddit ||= {};
  toolbox.UI ||= {};
  toolbox.version = '1.0.0-rc.6';

  globalThis.ToolboxFamily = family;
  globalThis.RedditToolbox = toolbox;
})();

/* src/core/errors.js */
(() => {
  'use strict';

  const { Core } = globalThis.RedditToolbox;

  class ToolboxError extends Error {
    constructor(message, options = {}) {
      super(message);
      this.name = new.target.name;
      this.code = options.code || 'TOOLBOX_ERROR';
      this.status = options.status || 0;
      this.retryable = options.retryable === true;
      this.pauseRequired = options.pauseRequired === true;
      this.details = options.details || null;
    }
  }

  class ApiError extends ToolboxError {}

  class AuthError extends ToolboxError {
    constructor(message = 'Sign in before using this toolbox.', options = {}) {
      super(message, {
        ...options,
        code: options.code || 'AUTH_REQUIRED',
        pauseRequired: true
      });
    }
  }

  class RateLimitError extends ToolboxError {
    constructor(message = 'The service asked the tool to slow down.', retryAfterMs = 60_000, options = {}) {
      super(message, {
        ...options,
        code: options.code || 'RATE_LIMITED',
        retryable: true
      });
      this.retryAfterMs = Math.max(1_000, Number(retryAfterMs) || 60_000);
    }
  }

  class PauseRequiredError extends ToolboxError {
    constructor(message, options = {}) {
      super(message, {
        ...options,
        code: options.code || 'PAUSE_REQUIRED',
        pauseRequired: true
      });
    }
  }

  Core.ToolboxError = ToolboxError;
  Core.ApiError = ApiError;
  Core.AuthError = AuthError;
  Core.RateLimitError = RateLimitError;
  Core.PauseRequiredError = PauseRequiredError;
})();

/* src/core/random.js */
(() => {
  'use strict';

  const { Core } = globalThis.RedditToolbox;
  const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

  function secureInteger(maxExclusive, randomSource = globalThis.crypto) {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError('maxExclusive must be a positive integer.');
    }

    if (randomSource?.getRandomValues) {
      const ceiling = Math.floor(0x1_0000_0000 / maxExclusive) * maxExclusive;
      const buffer = new Uint32Array(1);
      do {
        randomSource.getRandomValues(buffer);
      } while (buffer[0] >= ceiling);
      return buffer[0] % maxExclusive;
    }

    throw new Error('Secure random generation is unavailable. Cleanup cannot start.');
  }

  function randomLetterString(length = 24, randomSource = globalThis.crypto) {
    const safeLength = Math.min(128, Math.max(8, Math.trunc(Number(length) || 24)));
    let value = '';
    for (let index = 0; index < safeLength; index += 1) {
      value += LETTERS[secureInteger(LETTERS.length, randomSource)];
    }
    return value;
  }

  function randomBetween(min, max, random = Math.random) {
    const low = Math.min(Number(min) || 0, Number(max) || 0);
    const high = Math.max(Number(min) || 0, Number(max) || 0);
    return Math.round(low + (high - low) * random());
  }

  Core.secureInteger = secureInteger;
  Core.randomLetterString = randomLetterString;
  Core.randomBetween = randomBetween;
})();

/* src/core/csv.js */
(() => {
  'use strict';

  const { Core } = globalThis.RedditToolbox;

  function* csvRecords(text) {
    const source = String(text || '').replace(/^\uFEFF/, '');
    let row = [];
    let field = '';
    let quoted = false;
    let closedQuote = false;

    for (let index = 0; index < source.length; index += 1) {
      if (index && index % 32_768 === 0) yield { progress: index };
      const char = source[index];

      if (quoted) {
        if (char === '"' && source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else if (char === '"') {
          quoted = false;
          closedQuote = true;
        } else {
          field += char;
        }
        continue;
      }

      if (char === '"') {
        if (field || closedQuote) throw new Error('Unexpected quote in a CSV field.');
        quoted = true;
      } else if (char === ',') {
        row.push(field);
        field = '';
        closedQuote = false;
      } else if (char === '\n') {
        row.push(field);
        if (row.some((value) => value !== '')) yield { values: row };
        row = [];
        field = '';
        closedQuote = false;
      } else if (char !== '\r') {
        if (closedQuote) throw new Error('Unexpected text after a quoted CSV field.');
        field += char;
      }
    }

    if (quoted) throw new Error('The CSV file ends inside a quoted field.');
    if (field.length > 0 || row.length > 0) {
      row.push(field);
      if (row.some((value) => value !== '')) yield { values: row };
    }
  }

  function csvHeaders(values) {
    const headers = values.map((header, index) => {
      const normalized = header.trim().toLowerCase().replace(/\s+/g, '_');
      return normalized || `column_${index + 1}`;
    });
    if (new Set(headers).size !== headers.length) throw new Error('Duplicate CSV headers.');
    return headers;
  }

  function csvObject(headers, values) {
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || '']));
  }

  function parseCsv(text) {
    let headers;
    const rows = [];
    for (const record of csvRecords(text)) {
      if (!record.values) continue;
      if (!headers) headers = csvHeaders(record.values);
      else rows.push(csvObject(headers, record.values));
    }
    return rows;
  }

  async function readCsvAsync(text, options = {}) {
    let headers;
    let count = 0;
    const yieldTask = options.yieldTask || (() => new Promise((resolve) => setTimeout(resolve, 0)));
    for (const record of csvRecords(text)) {
      if (options.signal?.aborted) throw new Error('Archive import cancelled.');
      if (!record.values) {
        options.onProgress?.(count);
        await yieldTask();
      } else if (!headers) {
        headers = csvHeaders(record.values);
        options.onHeaders?.(headers);
      } else {
        count += 1;
        options.onRow?.(csvObject(headers, record.values), record.values.length === headers.length);
      }
    }
    if (!headers) throw new Error('The CSV file is empty.');
    options.onProgress?.(count);
    return count;
  }

  function toCsv(rows, columns) {
    const keys = columns || Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
    const encode = (value) => {
      const text = String(value ?? '');
      return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    };
    return [
      keys.map(encode).join(','),
      ...rows.map((row) => keys.map((key) => encode(row[key])).join(','))
    ].join('\n');
  }

  Core.parseCsv = parseCsv;
  Core.readCsvAsync = readCsvAsync;
  Core.toCsv = toCsv;
})();

/* src/core/filters.js */
(() => {
  'use strict';

  const { Core } = globalThis.RedditToolbox;

  const DEFAULT_FILTERS = Object.freeze({
    includeComments: true,
    includePosts: true,
    dateMode: 'all',
    fromDate: '',
    throughDate: '',
    maxItems: 0,
    sortOrder: 'oldest',
    keepSubreddits: [],
    keepScoreAtOrAbove: null,
    textIncludes: ''
  });

  function cleanSubreddit(value) {
    return String(value || '')
      .trim()
      .replace(/^\/?r\//i, '')
      .toLowerCase();
  }

  function parseSubredditList(value) {
    const values = Array.isArray(value) ? value : String(value || '').split(/[\n,]/);
    return Array.from(new Set(values.map(cleanSubreddit).filter(Boolean)));
  }

  function normalizeFilters(input = {}) {
    const merged = { ...DEFAULT_FILTERS, ...input };
    const dateModes = new Set(['all', 'before', 'after', 'between']);
    const sortOrders = new Set(['oldest', 'newest']);
    const score = merged.keepScoreAtOrAbove;

    return {
      includeComments: merged.includeComments !== false,
      includePosts: merged.includePosts !== false,
      dateMode: dateModes.has(merged.dateMode) ? merged.dateMode : 'all',
      fromDate: String(merged.fromDate || ''),
      throughDate: String(merged.throughDate || ''),
      maxItems: Math.max(0, Math.min(100_000, Math.trunc(Number(merged.maxItems) || 0))),
      sortOrder: sortOrders.has(merged.sortOrder) ? merged.sortOrder : 'oldest',
      keepSubreddits: parseSubredditList(merged.keepSubreddits),
      keepScoreAtOrAbove: score === '' || score === null || score === undefined
        ? null
        : Number(score),
      textIncludes: String(merged.textIncludes || '').trim().toLowerCase()
    };
  }

  function dayBoundary(value, endOfDay = false) {
    if (!value) return null;
    const suffix = endOfDay ? 'T23:59:59.999' : 'T00:00:00.000';
    const time = new Date(`${value}${suffix}`).getTime();
    return Number.isFinite(time) ? time : null;
  }

  function dateRange(filters) {
    const normalized = normalizeFilters(filters);
    let start = null;
    let end = null;

    if (normalized.dateMode === 'after' || normalized.dateMode === 'between') {
      start = dayBoundary(normalized.fromDate, false);
      if (start === null) throw new Error('Choose a valid starting date.');
    }
    if (normalized.dateMode === 'before' || normalized.dateMode === 'between') {
      end = dayBoundary(normalized.throughDate, true);
      if (end === null) throw new Error('Choose a valid ending date.');
    }
    if (start !== null && end !== null && start > end) {
      throw new Error('The starting date must be before the ending date.');
    }
    return { start, end };
  }

  function itemText(item) {
    return [item.title, item.text, item.subreddit]
      .filter(Boolean)
      .join('\n')
      .toLowerCase();
  }

  function evaluateItem(item, filters, range = dateRange(filters)) {
    const normalized = normalizeFilters(filters);
    if (item.kind === 'comment' && !normalized.includeComments) return 'comments-disabled';
    if (item.kind === 'post' && !normalized.includePosts) return 'posts-disabled';
    if (!['comment', 'post'].includes(item.kind)) return 'unsupported-kind';

    const createdAt = Number(item.createdAt);
    if (!Number.isFinite(createdAt)) return 'missing-date';
    if (range.start !== null && createdAt < range.start) return 'before-range';
    if (range.end !== null && createdAt > range.end) return 'after-range';

    if (normalized.keepSubreddits.includes(cleanSubreddit(item.subreddit))) {
      return 'protected-subreddit';
    }
    if (normalized.keepSubreddits.length && !cleanSubreddit(item.subreddit)) return 'unknown-subreddit';
    if (normalized.keepScoreAtOrAbove !== null && Number.isFinite(normalized.keepScoreAtOrAbove)
      && (item.score === null || item.score === undefined || item.score === '' || !Number.isFinite(Number(item.score)))) return 'unknown-score';
    if (
      normalized.keepScoreAtOrAbove !== null
      && Number.isFinite(normalized.keepScoreAtOrAbove)
      && Number.isFinite(Number(item.score))
      && Number(item.score) >= normalized.keepScoreAtOrAbove
    ) {
      return 'protected-score';
    }
    if (normalized.textIncludes && !itemText(item).includes(normalized.textIncludes)) {
      return 'text-not-matched';
    }
    return null;
  }

  function selectItems(items, filters = {}) {
    const normalized = normalizeFilters(filters);
    const range = dateRange(normalized);
    const selected = [];
    const skipped = {};
    const seen = new Set();

    for (const item of items || []) {
      if (!item?.fullname || seen.has(item.fullname)) continue;
      seen.add(item.fullname);
      const reason = evaluateItem(item, normalized, range);
      if (reason) {
        skipped[reason] = (skipped[reason] || 0) + 1;
      } else {
        selected.push(item);
      }
    }

    selected.sort((left, right) => (
      normalized.sortOrder === 'newest'
        ? right.createdAt - left.createdAt
        : left.createdAt - right.createdAt
    ));

    const limited = normalized.maxItems > 0
      ? selected.slice(0, normalized.maxItems)
      : selected;
    if (limited.length < selected.length) {
      skipped['amount-limit'] = (skipped['amount-limit'] || 0) + selected.length - limited.length;
    }

    return { selected: limited, skipped, filters: normalized };
  }

  Core.DEFAULT_FILTERS = DEFAULT_FILTERS;
  Core.cleanSubreddit = cleanSubreddit;
  Core.parseSubredditList = parseSubredditList;
  Core.normalizeFilters = normalizeFilters;
  Core.dateRange = dateRange;
  Core.evaluateItem = evaluateItem;
  Core.selectItems = selectItems;
})();

/* src/core/plan.js */
(() => {
  'use strict';

  const { Core } = globalThis.RedditToolbox;
  const PLAN_VERSION = 3;
  const reviewedBindings = new WeakMap();
  const RETRYABLE_STATUSES = new Set(['failed', 'stopped']);

  function fnv1a(value) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function executionOptions(options = {}) {
    return {
      accountId: String(options.accountId || '').trim(),
      deleteUneditablePosts: options.deleteUneditablePosts === true,
      verifyOverwrite: options.verifyOverwrite !== false,
      replacementLength: Math.max(8, Math.min(128, Math.trunc(Number(options.replacementLength) || 24))),
      continueOnFailure: options.continueOnFailure !== false,
      maxConsecutiveFailures: Math.max(
        1,
        Math.min(20, Math.trunc(Number(options.maxConsecutiveFailures) || 5))
      )
    };
  }

  function planDigest(items, options = {}) {
    return fnv1a(planBinding(items, options));
  }

  function planBinding(items, options = {}) {
    const normalized = executionOptions(options);
    return JSON.stringify({ options: normalized, targets: (items || []).map((item) => (
      [item.kind, item.fullname, item.editable !== false]
    )) });
  }

  function createPlan(items, options = {}, now = Date.now()) {
    const targets = Array.from(items || [], (item) => ({ ...item }));
    const normalizedOptions = executionOptions(options);
    const digest = planDigest(targets, normalizedOptions);
    const plan = {
      version: PLAN_VERSION,
      mode: 'automated-batch',
      id: `plan-${now}-${digest}`,
      createdAt: new Date(now).toISOString(),
      startedAt: null,
      finishedAt: null,
      status: 'ready',
      digest,
      confirmation: `DELETE ${targets.length} ${targets.length === 1 ? 'ITEM' : 'ITEMS'}`,
      options: normalizedOptions,
      retryOf: null,
      retryNumber: 0,
      items: targets.map((content, index) => ({
        id: `${digest}:${index}:${content.fullname}`,
        content,
        status: 'ready',
        phase: 'queued',
        attempts: 0,
        startedAt: null,
        finishedAt: null,
        outcome: null,
        error: null
      }))
    };
    reviewedBindings.set(plan, planBinding(targets, normalizedOptions));
    return plan;
  }

  function createRetryPlan(plan, now = Date.now()) {
    if (!plan?.items || !Array.isArray(plan.items)) return null;
    const targets = plan.items
      .filter((item) => RETRYABLE_STATUSES.has(item.status))
      .map((item) => item.content);
    if (!targets.length) return null;
    const retry = createPlan(targets, plan.options, now);
    retry.retryOf = plan.id;
    retry.retryNumber = Math.max(1, Number(plan.retryNumber || 0) + 1);
    return retry;
  }

  function isPlanCurrent(plan) {
    if (plan?.version !== PLAN_VERSION || plan?.mode !== 'automated-batch') return false;
    if (!plan?.items || !Array.isArray(plan.items)) return false;
    const binding = planBinding(plan.items.map((item) => item.content), plan.options);
    return reviewedBindings.get(plan) === binding && plan.digest === fnv1a(binding);
  }

  function lockPlan(plan) {
    if (!isPlanCurrent(plan)) throw new Error('The reviewed batch changed. Prepare it again.');
    Object.freeze(plan.options);
    for (const item of plan.items) {
      Object.freeze(item.content);
      Object.defineProperty(item, 'content', { writable: false, configurable: false });
    }
    Object.freeze(plan.items);
    for (const name of ['options', 'items', 'digest', 'confirmation']) {
      Object.defineProperty(plan, name, { writable: false, configurable: false });
    }
  }

  function planSummary(plan) {
    const summary = {
      total: plan?.items?.length || 0,
      ready: 0,
      processing: 0,
      completed: 0,
      skipped: 0,
      failed: 0,
      unconfirmed: 0,
      stopped: 0,
      processed: 0,
      remaining: 0,
      percent: 0
    };
    for (const item of plan?.items || []) {
      summary[item.status] = (summary[item.status] || 0) + 1;
    }
    summary.processed = summary.completed + summary.skipped + summary.failed + summary.unconfirmed;
    summary.remaining = summary.ready + summary.processing + summary.stopped;
    summary.percent = summary.total
      ? Math.min(100, Math.round((summary.processed / summary.total) * 100))
      : 0;
    return summary;
  }

  Core.PLAN_VERSION = PLAN_VERSION;
  Core.fnv1a = fnv1a;
  Core.executionOptions = executionOptions;
  Core.planDigest = planDigest;
  Core.createPlan = createPlan;
  Core.createRetryPlan = createRetryPlan;
  Core.isPlanCurrent = isPlanCurrent;
  Core.lockPlan = lockPlan;
  Core.planSummary = planSummary;
})();

/* src/core/runner.js */
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
      this.summary = null;
      this.acquiringLock = false;
    }

    progress() {
      const summary = this.summary ? { ...this.summary } : Core.planSummary(this.plan);
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

    setItemStatus(item, status) {
      if (this.summary) {
        this.summary[item.status] -= 1;
        this.summary[status] += 1;
        const summary = this.summary;
        summary.processed = summary.completed + summary.skipped + summary.failed + summary.unconfirmed;
        summary.remaining = summary.ready + summary.processing + summary.stopped;
        summary.percent = summary.total ? Math.round(summary.processed / summary.total * 100) : 0;
      }
      item.status = status;
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
      this.setItemStatus(queueItem, 'processing');
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
            beforeMutation: () => this.waitWhilePaused(),
            isStopRequested: () => this.stopRequested
          });
          queueItem.outcome = outcome || { status: 'completed' };
          this.setItemStatus(queueItem, outcome?.status === 'skipped' ? 'skipped' : 'completed');
          queueItem.phase = queueItem.status;
          queueItem.finishedAt = new Date().toISOString();
          this.consecutiveFailures = 0;
          this.emit('item-finished', { queueItem, index, total });
          return;
        } catch (error) {
          if (error?.code === 'DELETE_RESULT_UNCERTAIN') {
            queueItem.error = { code: error.code, message: error.message };
            this.setItemStatus(queueItem, 'unconfirmed');
            queueItem.phase = 'unconfirmed';
            queueItem.finishedAt = new Date().toISOString();
            this.emit('item-unconfirmed', { queueItem, error, index, total });
            return;
          }
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
          this.setItemStatus(queueItem, 'failed');
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
        this.setItemStatus(queueItem, 'stopped');
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

      throw new Error('This browser cannot provide an exclusive cross-tab lock. Cleanup is unavailable.');
    }

    async run(plan) {
      if (this.acquiringLock || ACTIVE_STATES.has(this.state)) throw new Error('This batch runner is already active.');
      this.acquiringLock = true;
      try {
        return await this.withRunLock(() => this.runBatch(plan));
      } finally {
        this.acquiringLock = false;
      }
    }

    async runBatch(plan) {
      if (!Core.isPlanCurrent(plan)) throw new Error('The reviewed batch changed. Build a new preview.');
      Core.lockPlan(plan);
      if (!plan.items.some((item) => item.status === 'ready')) {
        throw new Error('This batch has no queued items.');
      }

      this.plan = plan;
      this.summary = Core.planSummary(plan);
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

        const hasMore = this.summary.ready > 0;
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
            this.setItemStatus(item, 'stopped');
            item.phase = 'stopped';
          }
        }
        plan.status = 'stopped';
        this.state = 'stopped';
        this.emit('batch-stopped', { plan });
      } else {
        plan.status = this.summary.failed || this.summary.unconfirmed ? 'completed-with-failures' : 'completed';
        this.state = plan.status;
        this.emit('batch-completed', { plan });
      }
      return Core.planSummary(plan);
    }
  }

  Core.wait = wait;
  Core.BatchRunner = BatchRunner;
  Core.ControlledRunner = BatchRunner;
})();

/* src/core/storage.js */
(() => {
  'use strict';

  const { Core } = globalThis.RedditToolbox;

  class SettingsStore {
    constructor(namespace = 'reddit-toolbox') {
      this.namespace = namespace;
    }

    key(name) {
      return `${this.namespace}:${name}`;
    }

    get(name, fallback = null) {
      const key = this.key(name);
      try {
        if (typeof GM_getValue === 'function') return GM_getValue(key, fallback);
        const raw = globalThis.localStorage?.getItem(key);
        return raw === null || raw === undefined ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    }

    set(name, value) {
      const key = this.key(name);
      try {
        if (typeof GM_setValue === 'function') {
          GM_setValue(key, value);
          return true;
        }
        globalThis.localStorage?.setItem(key, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    }

    remove(name) {
      const key = this.key(name);
      try {
        if (typeof GM_deleteValue === 'function') {
          GM_deleteValue(key);
          return true;
        }
        globalThis.localStorage?.removeItem(key);
        return true;
      } catch {
        return false;
      }
    }
  }

  function downloadText(filename, text, type = 'application/json') {
    const blob = new Blob([text], { type: `${type};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  Core.SettingsStore = SettingsStore;
  Core.downloadText = downloadText;
})();

/* src/reddit/model.js */
(() => {
  'use strict';

  const { Reddit } = globalThis.RedditToolbox;

  function normalizeFullname(value, kind) {
    const raw = String(value || '').trim();
    const expectedPrefix = kind === 'comment' ? 't1' : kind === 'post' ? 't3' : '';
    if (!expectedPrefix) return '';

    const prefixed = raw.match(/^(t[13])_([a-z0-9]+)$/i);
    if (prefixed) {
      return prefixed[1].toLowerCase() === expectedPrefix
        ? `${expectedPrefix}_${prefixed[2].toLowerCase()}`
        : '';
    }

    const base36 = raw.match(/^([a-z0-9]+)$/i)?.[1] || '';
    return base36 ? `${expectedPrefix}_${base36.toLowerCase()}` : '';
  }

  function parseTimestamp(value) {
    if (value === null || value === undefined || value === '') return NaN;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric > 10_000_000_000 ? numeric : numeric * 1_000;
    }
    const parsed = new Date(String(value)).getTime();
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  function normalizePermalink(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const url = new URL(raw, 'https://www.reddit.com');
      return `${url.pathname}${url.search}`;
    } catch {
      return raw.startsWith('/') ? raw : `/${raw}`;
    }
  }

  function inferArchiveKind(filename, row) {
    const name = String(filename || '').toLowerCase();
    if (name.includes('comment')) return 'comment';
    if (name.includes('post') || name.includes('submission')) return 'post';
    if (row.parent_id || row.link_id || row.body) return 'comment';
    return 'post';
  }

  function subredditFromPermalink(permalink) {
    return String(permalink || '').match(/\/r\/([^/]+)/i)?.[1] || '';
  }

  function listingChildToItem(child) {
    const data = child?.data || {};
    const kind = child?.kind === 't1' ? 'comment' : child?.kind === 't3' ? 'post' : null;
    if (!kind) return null;
    const fullname = normalizeFullname(data.name || data.id, kind);
    const createdAt = parseTimestamp(data.created_utc ?? data.created);
    if (!fullname || !Number.isFinite(createdAt)) return null;

    const isSelf = kind === 'comment' ? true : data.is_self === true;
    return {
      fullname,
      kind,
      createdAt,
      subreddit: String(data.subreddit || ''),
      score: Number.isFinite(Number(data.score)) ? Number(data.score) : null,
      permalink: normalizePermalink(data.permalink),
      title: kind === 'post' ? String(data.title || '') : '',
      text: kind === 'comment' ? String(data.body || '') : String(data.selftext || ''),
      author: String(data.author || ''),
      isSelf,
      editable: kind === 'comment' || isSelf,
      source: 'profile'
    };
  }

  function archiveRowToItem(row, filename = '') {
    const kind = inferArchiveKind(filename, row || {});
    const permalink = normalizePermalink(
      row.permalink || row.url || row.link || row.path || ''
    );
    const rawId = row.fullname || row.name || row.id || row.comment_id || row.post_id || '';
    const fullname = normalizeFullname(rawId, kind);
    const createdAt = parseTimestamp(
      row.created_utc || row.created || row.date || row.timestamp || row.created_at
    );
    if (!fullname || !Number.isFinite(createdAt)) return null;

    const text = String(row.body || row.selftext || row.text || row.content || '');
    const explicitSelf = /^(true|1|yes)$/i.test(String(row.is_self || row.is_self_post || ''));
    const isSelf = kind === 'comment' ? true : explicitSelf || Boolean(text);

    return {
      fullname,
      kind,
      createdAt,
      subreddit: String(row.subreddit || subredditFromPermalink(permalink)),
      score: row.score !== '' && row.score !== undefined && Number.isFinite(Number(row.score)) ? Number(row.score) : null,
      permalink,
      title: kind === 'post' ? String(row.title || '') : '',
      text,
      author: String(row.author || row.username || ''),
      isSelf,
      editable: kind === 'comment' || isSelf,
      source: 'archive'
    };
  }

  function mergeItems(...collections) {
    const merged = new Map();
    for (const collection of collections) for (const item of (Array.isArray(collection) ? collection : [collection])) {
      if (!item?.fullname) continue;
      const current = merged.get(item.fullname);
      if (!current) {
        merged.set(item.fullname, { ...item });
        continue;
      }
      const profile = item.source?.includes('profile') ? item : current.source?.includes('profile') ? current : null;
      const preferred = profile || item;
      merged.set(item.fullname, {
        ...current,
        ...preferred,
        title: preferred.title || current.title || '',
        text: preferred.text || current.text || '',
        subreddit: preferred.subreddit || current.subreddit || '',
        permalink: preferred.permalink || current.permalink || '',
        score: preferred.score ?? current.score ?? null,
        author: preferred.author || current.author || '',
        source: current.source === preferred.source ? preferred.source : 'profile+archive'
      });
    }
    return Array.from(merged.values());
  }

  function archiveRowsToItems(rows, filename = '') {
    return (rows || []).map((row) => archiveRowToItem(row, filename)).filter(Boolean);
  }

  Reddit.normalizeFullname = normalizeFullname;
  Reddit.parseTimestamp = parseTimestamp;
  Reddit.normalizePermalink = normalizePermalink;
  Reddit.inferArchiveKind = inferArchiveKind;
  Reddit.listingChildToItem = listingChildToItem;
  Reddit.archiveRowToItem = archiveRowToItem;
  Reddit.archiveRowsToItems = archiveRowsToItems;
  Reddit.mergeItems = mergeItems;
})();

/* src/reddit/api.js */
(() => {
  'use strict';

  const { Core, Reddit } = globalThis.RedditToolbox;

  function retryAfterMilliseconds(response, fallback = 60_000) {
    const header = response?.headers?.get?.('retry-after');
    if (!header) {
      const reset = Number(response?.headers?.get?.('x-ratelimit-reset'));
      return Number.isFinite(reset) && reset > 0 ? Math.ceil(reset * 1_000) + 1_000 : fallback;
    }
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(1_000, seconds * 1_000);
    const date = new Date(header).getTime();
    return Number.isFinite(date) ? Math.max(1_000, date - Date.now()) : fallback;
  }

  function rateLimitFromMessage(message) {
    const text = String(message || '');
    const match = text.match(/(\d+)\s*(second|minute|hour)/i);
    if (!match) return 60_000;
    const unit = match[2].toLowerCase();
    const multiplier = unit === 'hour' ? 3_600_000 : unit === 'minute' ? 60_000 : 1_000;
    return Number(match[1]) * multiplier;
  }

  function apiErrors(payload) {
    const errors = payload?.json?.errors;
    if (!Array.isArray(errors)) return [];
    return errors.map((entry) => ({
      code: String(entry?.[0] || 'REDDIT_ERROR'),
      message: String(entry?.[1] || 'Reddit rejected the request.'),
      field: String(entry?.[2] || '')
    }));
  }

  function sameUsername(left, right) {
    return String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase();
  }

  class RedditSessionClient {
    constructor(options = {}) {
      const defaultFetch = globalThis.fetch?.bind(globalThis);
      this.fetch = options.fetchImpl || defaultFetch;
      this.origin = options.origin || globalThis.location?.origin || 'https://www.reddit.com';
      this.modhash = options.modhash || '';
      this.username = options.username || '';
      this.rateLimitUntil = 0;
      this.now = options.now || Date.now;
      this.requestTimeoutMs = Math.max(100, Math.min(60_000, Number(options.requestTimeoutMs) || 30_000));
      if (typeof this.fetch !== 'function') throw new Error('Fetch is unavailable.');
    }

    url(path) {
      const url = new URL(path, this.origin);
      if (url.protocol !== 'https:' || url.origin !== this.origin || url.username || url.password
        || !['www.reddit.com', 'old.reddit.com', 'new.reddit.com', 'sh.reddit.com'].includes(url.hostname)) {
        throw new Error('Reddit Toolbox only sends requests to its approved Reddit origin.');
      }
      return url;
    }

    async readResponse(response) {
      const contentType = response.headers?.get?.('content-type') || '';
      const remaining = response.headers?.get?.('x-ratelimit-remaining');
      if (response.status === 429 || (remaining !== null && remaining !== undefined && remaining !== '' && Number(remaining) <= 0)) {
        this.rateLimitUntil = Math.max(this.rateLimitUntil, this.now() + retryAfterMilliseconds(response));
      }
      // Interpret definite HTTP rejection before attempting to read a possibly broken body.
      if (response.status === 429) throw new Core.RateLimitError('Reddit asked the tool to slow down.', retryAfterMilliseconds(response));
      if (response.status === 401) throw new Core.AuthError('Your Reddit session expired. Sign in again, then resume.', { status: 401 });
      if (response.status === 403) throw new Core.PauseRequiredError('Reddit blocked this request. Check the page for an account notice.', { code: 'REDDIT_FORBIDDEN', status: 403 });
      let text;
      try { text = await response.text(); } catch {
        throw new Core.ApiError('Reddit response was interrupted.', { code: 'RESPONSE_LOST', status: response.status, retryable: true });
      }
      let payload = null;
      if (text && (contentType.includes('json') || /^[\s]*[\[{]/.test(text))) {
        try {
          payload = JSON.parse(text);
        } catch {
          throw new Core.ApiError('Reddit returned malformed JSON.', {
            code: 'INVALID_JSON',
            status: response.status,
            retryable: true
          });
        }
      }

      if (!response.ok) {
        throw new Core.ApiError(`Reddit returned HTTP ${response.status}.`, {
          code: `HTTP_${response.status}`,
          status: response.status,
          retryable: response.status >= 500
        });
      }

      if (payload?.success === false || payload?.error) {
        const status = Number(payload.error);
        if (status === 401) throw new Core.AuthError();
        if (status === 403) throw new Core.PauseRequiredError('Reddit rejected this request. Check the account notice on the page.', { code: 'REDDIT_FORBIDDEN', status });
        if (status === 429) throw new Core.RateLimitError('Reddit asked the tool to slow down.', retryAfterMilliseconds(response));
        throw new Core.ApiError('Reddit rejected the operation.', { code: 'REDDIT_REJECTED' });
      }

      const errors = apiErrors(payload);
      if (errors.length) {
        const first = errors[0];
        if (first.code.toUpperCase().includes('RATELIMIT')) {
          throw new Core.RateLimitError(first.message, rateLimitFromMessage(first.message), {
            details: errors
          });
        }
        if (/captcha|challenge|verification/i.test(`${first.code} ${first.message}`)) {
          throw new Core.PauseRequiredError(first.message, {
            code: first.code,
            details: errors
          });
        }
        throw new Core.ApiError(first.message, {
          code: first.code,
          details: errors
        });
      }

      if (text && (!payload || typeof payload !== 'object')) {
        throw new Core.PauseRequiredError('Reddit returned an unrecognized response. Check the page before resuming.', { code: 'UNRECOGNIZED_RESPONSE', status: response.status });
      }
      return payload;
    }

    async request(path, init) {
      const url = this.url(path);
      if (this.rateLimitUntil > this.now()) {
        throw new Core.RateLimitError('Waiting for Reddit’s request allowance to reset.', this.rateLimitUntil - this.now());
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
      try {
        const response = await this.fetch(url, {
          ...init,
          credentials: 'include',
          cache: 'no-store',
          redirect: 'error',
          signal: controller.signal
        });
        return await this.readResponse(response);
      } catch (error) {
        if (error instanceof Core.ToolboxError) throw error;
        throw new Core.ApiError('The Reddit request did not complete.', {
          code: 'NETWORK_ERROR',
          retryable: true
        });
      } finally {
        clearTimeout(timeout);
      }
    }

    async getJson(path) {
      return this.request(path, { method: 'GET', headers: { Accept: 'application/json' } });
    }

    async postForm(path, values) {
      if (this.origin !== 'https://www.reddit.com') throw new Core.AuthError('Open www.reddit.com for cleanup. A single origin is required for the cross-tab lock.', { code: 'CANONICAL_ORIGIN_REQUIRED' });
      if (!this.modhash) throw new Core.AuthError('Reddit did not provide a session modhash. Refresh and sign in again.');
      const body = new URLSearchParams({ ...values, uh: this.modhash });
      return this.request(path, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            'X-Modhash': this.modhash
          },
          body
      });
    }

    async getSession(requireModhash = false) {
      // Never retain action credentials after a failed session refresh.
      this.username = '';
      this.modhash = '';
      const payload = await this.getJson('/api/me.json?raw_json=1');
      const data = payload?.data;
      if (!data?.name) throw new Core.AuthError();
      this.username = String(data.name);
      this.modhash = String(data.modhash || '');
      if (requireModhash && !this.modhash) {
        throw new Core.AuthError(
          'Reddit did not provide its session action token. Refresh the page and sign in again before cleanup.',
          { code: 'MODHASH_MISSING' }
        );
      }
      return { username: this.username, modhash: this.modhash };
    }

    async assertSession(expectedUsername, requireModhash = true) {
      const session = await this.getSession(requireModhash);
      if (expectedUsername && !sameUsername(session.username, expectedUsername)) {
        throw new Core.PauseRequiredError(
          'The signed-in Reddit account changed. Switch back to the reviewed account before resuming.',
          {
            code: 'ACCOUNT_CHANGED',
          }
        );
      }
      return session;
    }

    async listUserContent(kind, options = {}) {
      if (!this.username) await this.getSession();
      const section = kind === 'comment' ? 'comments' : 'submitted';
      const params = new URLSearchParams({
        raw_json: '1',
        limit: String(Math.min(100, Math.max(1, Number(options.limit) || 100))),
        sort: 'new',
        t: 'all',
        count: String(Math.max(0, Number(options.count) || 0))
      });
      if (options.after) params.set('after', options.after);
      const path = `/user/${encodeURIComponent(this.username)}/${section}.json?${params}`;
      const payload = await this.getJson(path);
      if (!Array.isArray(payload?.data?.children)) throw new Core.ApiError('Reddit did not return a valid history listing.', { code: 'INVALID_LISTING' });
      const children = payload.data.children;
      return {
        items: children.map(Reddit.listingChildToItem).filter(Boolean),
        after: payload?.data?.after || null
      };
    }

    async edit(fullname, text) {
      return this.postForm('/api/editusertext', {
        api_type: 'json',
        raw_json: '1',
        return_rtjson: 'false',
        thing_id: fullname,
        text
      });
    }

    async getThing(fullname) {
      if (!/^t[13]_[a-z0-9]+$/.test(fullname)) throw new Core.ApiError('Invalid content ID.', { code: 'INVALID_TARGET' });
      const params = new URLSearchParams({ id: fullname, raw_json: '1' });
      const payload = await this.getJson(`/api/info.json?${params}`);
      const children = payload?.data?.children;
      if (!Array.isArray(children)) throw new Core.PauseRequiredError('Reddit did not return a valid item listing.', { code: 'INVALID_LISTING' });
      if (!children.length) return null;
      const child = children[0];
      if (children.length !== 1 || !['t1', 't3'].includes(child.kind)) throw new Core.PauseRequiredError('Reddit returned an unexpected target.', { code: 'TARGET_MISMATCH' });
      const actualFullname = Reddit.normalizeFullname(
        child.data?.name || child.data?.id,
        child.kind === 't1' ? 'comment' : 'post'
      );
      if (actualFullname !== fullname) throw new Core.PauseRequiredError('Reddit returned a different target.', { code: 'TARGET_MISMATCH' });
      return child;
    }

    async inspectTarget(fullname) {
      const child = await this.getThing(fullname);
      if (!child) return { available: false, owned: false };
      return {
        available: true,
        owned: sameUsername(child.data?.author, this.username),
        editable: child.kind === 't1' || child.data?.is_self === true
      };
    }

    async verifyOwnership(fullname) {
      if (!this.username) await this.getSession();
      const child = await this.getThing(fullname);
      return Boolean(
        child
        && String(child.data?.author || '').toLowerCase() === this.username.toLowerCase()
      );
    }

    async verifyText(fullname, expected) {
      const child = await this.getThing(fullname);
      if (!child) return false;
      const actual = child.kind === 't1' ? child.data?.body : child.data?.selftext;
      return String(actual ?? '') === String(expected);
    }

    async getDeletionStatus(fullname) {
      const child = await this.getThing(fullname);
      if (!child) return { status: 'missing' };
      const data = child.data;
      const text = String(child.kind === 't1' ? data.body ?? '' : data.selftext ?? '');
      const deletedAuthor = data.author === null || String(data.author).toLowerCase() === '[deleted]';
      const deleted = data.removed_by_category === 'deleted'
        || (deletedAuthor && ['', '[deleted]'].includes(text.trim().toLowerCase()));
      return {
        status: deleted ? 'deleted' : 'present',
        authorDeleted: deletedAuthor,
        owned: Boolean(this.username && sameUsername(data.author, this.username)),
        editable: child.kind === 't1' || data.is_self === true,
        text
      };
    }

    async isDeleted(fullname) {
      return (await this.getDeletionStatus(fullname)).status === 'deleted';
    }

    async delete(fullname) {
      return this.postForm('/api/del', { id: fullname });
    }
  }

  Reddit.retryAfterMilliseconds = retryAfterMilliseconds;
  Reddit.rateLimitFromMessage = rateLimitFromMessage;
  Reddit.apiErrors = apiErrors;
  Reddit.sameUsername = sameUsername;
  Reddit.RedditSessionClient = RedditSessionClient;
})();

/* src/reddit/scanner.js */
(() => {
  'use strict';

  const { Core, Reddit } = globalThis.RedditToolbox;

  class RedditScanner {
    constructor(client, options = {}) {
      this.client = client;
      this.maxPagesPerType = Math.max(1, Math.min(100, Number(options.maxPagesPerType) || 25));
      this.pageDelayMs = Math.max(0, Number(options.pageDelayMs) || 650);
      this.sleep = options.sleep || Core.wait;
      this.onProgress = options.onProgress || (() => {});
    }

    async scanKind(kind) {
      const items = [];
      let after = null;
      let count = 0;
      let pages = 0;
      let cursorLoop = false;
      const seenCursors = new Set();

      do {
        const page = await this.client.listUserContent(kind, { after, count, limit: 100 });
        items.push(...page.items);
        count += page.items.length;
        pages += 1;
        const nextAfter = page.after;
        cursorLoop = Boolean(nextAfter && seenCursors.has(nextAfter));
        if (nextAfter) seenCursors.add(nextAfter);
        after = nextAfter;
        this.onProgress({ kind, pages, count, after, cursorLoop });
        if (cursorLoop) break;
        if (after && pages < this.maxPagesPerType) await this.sleep(this.pageDelayMs);
      } while (after && pages < this.maxPagesPerType);

      return { items, pages, truncated: Boolean(after), cursorLoop };
    }

    async scanProfile(options = {}) {
      const includeComments = options.includeComments !== false;
      const includePosts = options.includePosts !== false;
      await this.client.getSession();
      const results = [];
      const report = { comments: null, posts: null };

      if (includeComments) {
        report.comments = await this.scanKind('comment');
        results.push(...report.comments.items);
      }
      if (includePosts) {
        report.posts = await this.scanKind('post');
        results.push(...report.posts.items);
      }
      return {
        username: this.client.username,
        items: Reddit.mergeItems(results),
        report
      };
    }
  }

  function importArchiveCsv(text, filename) {
    const rows = Core.parseCsv(text);
    return {
      filename,
      rowCount: rows.length,
      items: Reddit.archiveRowsToItems(rows, filename)
    };
  }

  async function importArchiveCsvAsync(text, filename, options = {}) {
    if (!/^(comments|posts)\.csv$/i.test(filename)) throw new Error('Choose comments.csv or posts.csv from your Reddit export.');
    const items = new Map();
    let rejected = 0;
    let duplicates = 0;
    const rowCount = await Core.readCsvAsync(text, {
      ...options,
      onHeaders(headers) {
        const hasId = ['fullname', 'name', 'id', 'comment_id', 'post_id'].some((name) => headers.includes(name));
        const hasDate = ['created_utc', 'created', 'date', 'timestamp', 'created_at'].some((name) => headers.includes(name));
        if (!hasId || !hasDate) throw new Error('The archive needs explicit item ID and date columns. IDs are not inferred from links.');
      },
      onRow(row, validWidth) {
        const item = validWidth ? Reddit.archiveRowToItem(row, filename) : null;
        if (!item) rejected += 1;
        else if (items.has(item.fullname)) duplicates += 1;
        else items.set(item.fullname, item);
      }
    });
    return { filename, rowCount, rejected, duplicates, items: Array.from(items.values()) };
  }

  Reddit.RedditScanner = RedditScanner;
  Reddit.importArchiveCsv = importArchiveCsv;
  Reddit.importArchiveCsvAsync = importArchiveCsvAsync;
})();

/* src/reddit/removal-service.js */
(() => {
  'use strict';

  const { Core, Reddit } = globalThis.RedditToolbox;

  class RedditRemovalService {
    constructor(client, options = {}) {
      this.client = client;
      this.deleteUneditablePosts = options.deleteUneditablePosts === true;
      this.verifyOverwrite = true;
      this.verifyOwnership = true;
      this.verifyDeletion = true;
      this.replacementLength = Math.max(8, Math.min(128, Number(options.replacementLength) || 24));
      this.minimumSettleMs = Math.max(250, Number(options.minimumSettleMs) || 900);
      this.maximumSettleMs = Math.max(this.minimumSettleMs, Number(options.maximumSettleMs) || 1_500);
      this.verificationAttempts = Math.max(1, Math.min(5, Math.trunc(Number(options.verificationAttempts) || 3)));
      this.verificationDelayMs = Math.max(100, Number(options.verificationDelayMs) || 750);
      this.deletionVerificationAttempts = Math.max(2, Math.min(8, Number(options.deletionVerificationAttempts) || 6));
      this.sleep = options.sleep || Core.wait;
      this.random = options.random || Math.random;
      this.randomSource = options.randomSource || globalThis.crypto;
      this.expectedUsername = String(options.expectedUsername || '').trim();
      this.states = new Map();
    }

    report(context, phase, detail = {}) {
      context?.reportPhase?.(phase, detail);
    }

    stateFor(fullname) {
      if (!this.states.has(fullname)) {
        this.states.set(fullname, {
          ownershipVerified: false,
          replacement: '',
          editSent: false,
          edited: false,
          deleteSent: false,
          deleteAcknowledged: false,
          deleteAttempts: 0
        });
      }
      return this.states.get(fullname);
    }

    async verifyWithRetries(check) {
      for (let attempt = 1; attempt <= this.verificationAttempts; attempt += 1) {
        if (await check()) return true;
        if (attempt < this.verificationAttempts) {
          await this.sleep(this.verificationDelayMs * attempt);
        }
      }
      return false;
    }

    async ensureSession(context) {
      if (!this.expectedUsername) return;
      if (typeof this.client.assertSession !== 'function') {
        throw new Core.PauseRequiredError(
          'The Reddit adapter cannot revalidate the active account for this automated batch.',
          { code: 'SESSION_RECHECK_UNAVAILABLE' }
        );
      }
      this.report(context, 'checking-session');
      await this.client.assertSession(this.expectedUsername, true);
    }

    async ensureOwnership(item, state) {
      if (typeof this.client.inspectTarget === 'function') {
        const target = await this.client.inspectTarget(item.fullname);
        if (!target.available || !target.owned) throw new Core.ApiError('Ownership could not be verified.', { code: 'OWNERSHIP_NOT_VERIFIED' });
        if (target.editable !== (item.editable !== false)) throw new Core.ApiError('Live editability differs from the reviewed batch. Prepare a new review.', { code: 'EDITABILITY_CHANGED' });
        state.ownershipVerified = true;
        return;
      }
      if (typeof this.client.verifyOwnership !== 'function') {
        throw new Core.ApiError('The Reddit adapter cannot verify item ownership.', {
          code: 'OWNERSHIP_CHECK_UNAVAILABLE'
        });
      }
      if (!await this.client.verifyOwnership(item.fullname)) {
        throw new Core.ApiError('The item could not be verified as belonging to the signed-in account.', {
          code: 'OWNERSHIP_NOT_VERIFIED'
        });
      }
      state.ownershipVerified = true;
    }

    async verifyDeleted(item, state, context = {}, allowResend = true) {
      if (!this.verifyDeletion) return true;
      await this.ensureSession();
      if (typeof this.client.isDeleted !== 'function' && typeof this.client.getDeletionStatus !== 'function') {
        throw new Core.PauseRequiredError(
          'The delete request was sent, but this adapter cannot verify the result.',
          { code: 'DELETE_RESULT_UNVERIFIED' }
        );
      }
      let missingReads = 0;
      let presentReads = 0;
      let last;
      for (let attempt = 0; attempt < this.deletionVerificationAttempts; attempt += 1) {
        last = typeof this.client.getDeletionStatus === 'function'
          ? await this.client.getDeletionStatus(item.fullname)
          : { status: await this.client.isDeleted(item.fullname) ? 'deleted' : 'unknown' };
        missingReads = last.status === 'missing' ? missingReads + 1 : 0;
        presentReads = last.status === 'present' && last.owned ? presentReads + 1 : 0;
        // Live Reddit can preserve the moderation placeholder after an owner
        // deletes a comment. Require our accepted delete and prior ownership;
        // [removed] alone (or an active author) is never enough.
        const deletedRemovedComment = item.kind === 'comment'
          && last.authorDeleted === true && last.text?.trim().toLowerCase() === '[removed]'
          && state.deleteAcknowledged && state.ownershipVerified;
        if (last.status === 'deleted'
          || deletedRemovedComment
          || (missingReads >= 2 && state.deleteAcknowledged && state.ownershipVerified)) {
          state.completed = true;
          state.deletionEvidence = last.status === 'deleted' ? 'deleted-marker'
            : deletedRemovedComment ? 'accepted-and-author-deleted' : 'accepted-and-no-longer-returned';
          return true;
        }
        if (context.isStopRequested?.()) break;
        if (attempt + 1 < this.deletionVerificationAttempts) {
          this.report(context, 'verifying-deletion', { attempt: attempt + 1 });
          await this.sleep(Math.min(6_000, this.verificationDelayMs * (2 ** (attempt + 1))));
        }
      }

      // A successful response can be a no-op. Retry once only after repeated live
      // evidence of the same owned target; never resend an ambiguous request.
      if (allowResend && !context.isStopRequested?.() && state.deleteAcknowledged
        && state.deleteAttempts < 2 && presentReads >= 2
        && last.editable === (item.editable !== false)
        && (item.editable === false || last.text === state.replacement)) {
        await context.beforeMutation?.();
        await this.ensureSession(context);
        await this.ensureOwnership(item, state);
        if (item.editable !== false && !await this.client.verifyText(item.fullname, state.replacement)) {
          throw new Core.ApiError('The saved text changed. This item needs a new review.', { code: 'OVERWRITE_NOT_VERIFIED' });
        }
        this.report(context, 'retrying-delete');
        await this.sendDelete(item, state);
        return this.verifyDeleted(item, state, context, false);
      }
      throw new Core.ApiError('Deletion is not confirmed yet. Other items can continue; recheck this result when cleanup finishes.', { code: 'DELETE_RESULT_UNCERTAIN' });
    }

    async sendDelete(item, state) {
      state.deleteSent = true;
      state.deleteAcknowledged = false;
      state.deleteAttempts += 1;
      try {
        await this.client.delete(item.fullname);
        state.deleteAcknowledged = true;
      } catch (error) {
        if (!this.isAmbiguousMutationError(error)) {
          state.deleteSent = false;
          throw error;
        }
      }
    }

    isAmbiguousMutationError(error) {
      return ['NETWORK_ERROR', 'RESPONSE_LOST', 'INVALID_JSON', 'UNRECOGNIZED_RESPONSE', 'API_REDIRECT'].includes(error?.code)
        || Number(error?.status) >= 500
        || !(error instanceof Core.ToolboxError);
    }

    async remove(item, context = {}) {
      const prefix = item?.kind === 'comment' ? 't1' : item?.kind === 'post' ? 't3' : '';
      if (!prefix || !new RegExp(`^${prefix}_[a-z0-9]+$`).test(item.fullname)) {
        throw new Core.ApiError('The item does not have a valid exact content ID.', { code: 'INVALID_TARGET' });
      }
      const directDelete = item.kind === 'post' && item.editable === false;
      if (directDelete && !this.deleteUneditablePosts) {
        this.report(context, 'skipped', { reason: 'post-has-no-editable-body' });
        return {
          status: 'skipped',
          reason: 'post-has-no-editable-body',
          overwritten: false,
          deleted: false
        };
      }

      const state = this.stateFor(item.fullname);
      if (state.completed) return { status: 'skipped', reason: 'already-completed', deleted: true };
      if (state.deleteSent) {
        this.report(context, 'verifying-deletion');
        await this.verifyDeleted(item, state, context);
        this.report(context, 'complete');
        return {
          status: 'completed',
          reason: directDelete ? 'deleted-uneditable-post' : 'overwritten-and-deleted',
          overwritten: !directDelete,
          verified: directDelete ? false : this.verifyOverwrite,
          deleted: true
        };
      }

      await this.ensureSession(context);
      this.report(context, 'checking-ownership');
      await this.ensureOwnership(item, state);

      if (directDelete) {
        await context.beforeMutation?.();
        await this.ensureSession(context);
        await this.ensureOwnership(item, state);
        this.report(context, 'deleting-direct');
        await this.sendDelete(item, state);
        this.report(context, 'verifying-deletion');
        await this.verifyDeleted(item, state, context);
        this.report(context, 'complete');
        return {
          status: 'completed',
          reason: 'deleted-uneditable-post',
          overwritten: false,
          verified: false,
          deleted: true
        };
      }

      if (!state.replacement) {
        this.report(context, 'preparing-replacement');
        state.replacement = Core.randomLetterString(this.replacementLength, this.randomSource);
      }

      if (state.editSent && !state.edited) {
        this.report(context, 'verifying-overwrite');
        const alreadySaved = await this.verifyWithRetries(
          () => this.client.verifyText(item.fullname, state.replacement)
        );
        if (alreadySaved) state.edited = true;
        else throw new Core.PauseRequiredError('The previous overwrite remains uncertain. No edit or delete was repeated.', { code: 'OVERWRITE_RESULT_UNCERTAIN' });
      }

      if (!state.edited) {
        await context.beforeMutation?.();
        await this.ensureSession(context);
        await this.ensureOwnership(item, state);
        this.report(context, 'overwriting');
        state.editSent = true;
        try {
          await this.client.edit(item.fullname, state.replacement);
          state.edited = true;
        } catch (error) {
          if (!this.isAmbiguousMutationError(error)) {
            state.editSent = false;
            throw error;
          }
          this.report(context, 'verifying-overwrite');
          const saved = await this.verifyWithRetries(
            () => this.client.verifyText(item.fullname, state.replacement)
          );
          if (!saved) {
            throw new Core.PauseRequiredError('The overwrite may have been sent, but its saved text cannot be confirmed. No delete was sent.', { code: 'OVERWRITE_RESULT_UNCERTAIN' });
          }
          state.edited = true;
        }
      }

      const settleMs = Core.randomBetween(this.minimumSettleMs, this.maximumSettleMs, this.random);
      this.report(context, 'waiting-for-save', { delayMs: settleMs });
      await this.sleep(settleMs);

      if (this.verifyOverwrite) {
        this.report(context, 'verifying-overwrite');
        const verified = await this.verifyWithRetries(
          () => this.client.verifyText(item.fullname, state.replacement)
        );
        if (!verified) {
          throw new Core.PauseRequiredError('The overwrite could not be verified, so the item was not deleted.', {
            code: 'OVERWRITE_NOT_VERIFIED',
          });
        }
      }

      await context.beforeMutation?.();
      await this.ensureSession(context);
      await this.ensureOwnership(item, state);
      // A pause can last arbitrarily long; verify again at the deletion boundary.
      if (!await this.client.verifyText(item.fullname, state.replacement)) {
        throw new Core.PauseRequiredError('The saved replacement changed before deletion. No delete was sent.', { code: 'OVERWRITE_NOT_VERIFIED' });
      }
      this.report(context, 'deleting');
      await this.sendDelete(item, state);
      this.report(context, 'verifying-deletion');
      await this.verifyDeleted(item, state, context);
      this.report(context, 'complete');
      return {
        status: 'completed',
        reason: 'overwritten-and-deleted',
        overwritten: true,
        verified: this.verifyOverwrite,
        deleted: true
      };
    }
  }

  Reddit.RedditRemovalService = RedditRemovalService;
})();

/* src/ui/styles.js */
(() => {
  'use strict';

  globalThis.RedditToolbox.UI.styles = String.raw`
    :host {
      --rt-accent: #b83200;
      --rt-accent-hover: #9c2b00;
      --rt-bg: #ffffff;
      --rt-bg-subtle: #f6f7f8;
      --rt-border: #d6d9dc;
      --rt-text: #1c1c1c;
      --rt-muted: #576f76;
      --rt-danger: #b42318;
      --rt-warning: #b54708;
      --rt-success: #067647;
      color: var(--rt-text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 14px;
      line-height: 1.45;
    }

    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    summary { cursor: pointer; color: var(--rt-muted); font-weight: 600; }
    summary:focus-visible { outline: 2px solid var(--rt-accent); outline-offset: 3px; }
    details[open] > summary { margin-bottom: 12px; }
    .advanced > .grid, .advanced > .checks { margin-bottom: 12px; }
    button, input, select, textarea { font: inherit; }
    button { cursor: pointer; }
    button:disabled { cursor: not-allowed; opacity: .5; }

    .launcher {
      align-items: center;
      background: #b83200;
      border: 3px solid transparent;
      border-radius: 999px;
      bottom: 20px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, .22);
      color: white;
      display: flex;
      font-size: 13px;
      font-weight: 800;
      height: 48px;
      justify-content: center;
      letter-spacing: .01em;
      padding: 0;
      position: fixed;
      right: 20px;
      transition: background-color .18s ease, border-color .18s ease, color .18s ease, transform .18s ease;
      width: 48px;
      z-index: 2147483646;
    }

    .launcher:hover { background: var(--rt-accent-hover); transform: translateY(-1px); }
    .launcher.running { animation: rt-pulse 1.8s ease-in-out infinite; background: var(--rt-bg); border-color: var(--rt-accent); color: var(--rt-accent); font-size: 11px; }
    .launcher.running:hover { background: var(--rt-bg-subtle); }
    .launcher.paused { background: var(--rt-warning); }
    .launcher.paused:hover { background: var(--rt-warning); }
    .launcher.stopping { background: var(--rt-muted); }
    .launcher.stopping:hover { background: var(--rt-muted); }
    .launcher.completed { background: var(--rt-success); }
    .launcher.completed:hover { background: var(--rt-success); }
    .launcher.failed { background: var(--rt-danger); }
    .launcher.failed:hover { background: var(--rt-danger); }
    .launcher-label { pointer-events: none; }
    .launcher-badge {
      align-items: center;
      background: #b42318;
      border: 2px solid var(--rt-bg);
      border-radius: 999px;
      color: white;
      display: flex;
      font-size: 9px;
      font-weight: 800;
      height: 20px;
      justify-content: center;
      min-width: 20px;
      padding: 0 4px;
      position: absolute;
      right: -6px;
      top: -6px;
    }

    .panel {
      background: var(--rt-bg);
      border: 1px solid var(--rt-border);
      border-radius: 16px;
      bottom: 80px;
      box-shadow: 0 18px 60px rgba(0, 0, 0, .28);
      display: none;
      max-height: min(860px, calc(100vh - 110px));
      overflow: hidden;
      position: fixed;
      right: 20px;
      width: min(490px, calc(100vw - 24px));
      z-index: 2147483647;
    }

    .panel.open { display: flex; flex-direction: column; }

    .header {
      align-items: center;
      border-bottom: 1px solid var(--rt-border);
      display: flex;
      justify-content: space-between;
      padding: 15px 16px;
    }

    .brand { display: grid; gap: 1px; }
    .brand strong { font-size: 16px; }
    .brand span { color: var(--rt-muted); font-size: 12px; }

    .icon-button {
      align-items: center;
      background: transparent;
      border: 0;
      border-radius: 8px;
      color: var(--rt-muted);
      display: flex;
      height: 32px;
      justify-content: center;
      width: 32px;
    }

    .icon-button:hover { background: var(--rt-bg-subtle); color: var(--rt-text); }

    .content { overflow: auto; padding: 16px; min-height: 0; }
    .section { display: grid; gap: 12px; margin-bottom: 20px; }
    .section:last-child { margin-bottom: 0; }
    .section-title { align-items: baseline; display: flex; gap: 12px; justify-content: space-between; }
    .section-title h2 { font-size: 14px; margin: 0; flex-shrink: 0; }
    .section-title span { color: var(--rt-muted); font-size: 12px; text-align: right; }

    .notice {
      background: #fff4ed;
      border: 1px solid #ffd6ae;
      border-radius: 10px;
      color: #7a2e0e;
      font-size: 12px;
      padding: 10px 12px;
    }

    .automation-note {
      background: var(--rt-bg-subtle);
      border: 1px solid var(--rt-border);
      border-radius: 10px;
      color: var(--rt-muted);
      font-size: 12px;
      padding: 10px 12px;
    }

    .grid { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .compact-grid { gap: 6px; }
    .field { display: grid; gap: 5px; }
    .field.full { grid-column: 1 / -1; }
    .field label, .label { color: var(--rt-muted); font-size: 12px; font-weight: 650; }

    input[type="text"], input[type="number"], input[type="date"], select {
      background: var(--rt-bg);
      border: 1px solid var(--rt-border);
      border-radius: 8px;
      color: var(--rt-text);
      min-height: 38px;
      padding: 8px 10px;
      width: 100%;
    }

    input:focus, select:focus, button:focus-visible {
      outline: 2px solid var(--rt-accent);
      outline-offset: 1px;
    }

    .checks { display: flex; flex-wrap: wrap; gap: 12px 18px; }
    .check { align-items: center; display: inline-flex; gap: 7px; }
    .check input { accent-color: var(--rt-accent); height: 16px; width: 16px; }

    .actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .button {
      background: var(--rt-bg);
      border: 1px solid var(--rt-border);
      border-radius: 999px;
      color: var(--rt-text);
      font-weight: 700;
      min-height: 38px;
      padding: 8px 14px;
    }

    .button:hover:not(:disabled) { background: var(--rt-bg-subtle); }
    .button.primary { background: #b83200; border-color: #b83200; color: white; }
    .button.primary:hover:not(:disabled) { background: var(--rt-accent-hover); }
    .button.danger { background: #b42318; border-color: #b42318; color: white; }
    .button.link { border-color: transparent; padding-inline: 8px; }

    .file-input { display: none; }
    .status-line { color: var(--rt-muted); font-size: 12px; min-height: 18px; }
    .status-line.error { color: var(--rt-danger); }
    .status-line.success { color: var(--rt-success); }

    .summary, .batch-summary { display: grid; gap: 8px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .metric { background: var(--rt-bg-subtle); border-radius: 9px; min-width: 0; padding: 9px; }
    .metric strong { display: block; font-size: 16px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .metric span { color: var(--rt-muted); font-size: 11px; }

    .preview {
      border: 1px solid var(--rt-border);
      border-radius: 10px;
      max-height: 230px;
      overflow: auto;
    }

    .preview-empty { color: var(--rt-muted); padding: 18px; text-align: center; }
    .item { border-bottom: 1px solid var(--rt-border); display: grid; gap: 3px; padding: 10px 11px; }
    .item:last-child { border-bottom: 0; }
    .item-head { align-items: center; display: flex; flex-wrap: wrap; gap: 7px; overflow-wrap: anywhere; }
    .kind { color: var(--rt-accent); font-size: 10px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    .subreddit { font-weight: 700; }
    .date { color: var(--rt-muted); font-size: 11px; margin-left: auto; }
    .snippet { color: var(--rt-muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .item-status { color: var(--rt-muted); font-size: 11px; }
    .item-status.processing { color: var(--rt-accent); }
    .item-status.completed { color: var(--rt-success); }
    .item-status.failed { color: var(--rt-danger); }
    .item-status.stopped { color: var(--rt-warning); }

    .confirm { background: var(--rt-bg-subtle); border-radius: 10px; display: grid; gap: 8px; padding: 12px; }
    .confirm code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; font-weight: 750; }
    .current-action {
      background: var(--rt-bg-subtle);
      border-left: 3px solid var(--rt-accent);
      border-radius: 8px;
      color: var(--rt-text);
      font-size: 12px;
      min-height: 38px;
      padding: 10px 11px;
    }
    .progress { appearance: none; background: var(--rt-bg-subtle); border: 0; border-radius: 999px; height: 8px; overflow: hidden; width: 100%; }
    .progress::-webkit-progress-bar { background: var(--rt-bg-subtle); }
    .progress::-webkit-progress-value { background: var(--rt-accent); transition: width .2s ease; }
    .progress::-moz-progress-bar { background: var(--rt-accent); }

    .log { background: var(--rt-bg-subtle); border-radius: 9px; color: var(--rt-muted); font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; max-height: 150px; overflow: auto; padding: 9px; white-space: pre-wrap; }
    .hidden { display: none !important; }

    @keyframes rt-pulse {
      0%, 100% { box-shadow: 0 8px 24px rgba(0, 0, 0, .22); }
      50% { box-shadow: 0 8px 26px color-mix(in srgb, var(--rt-accent) 38%, transparent); }
    }

    @media (prefers-color-scheme: dark) {
      :host {
        --rt-bg: #17191a;
        --rt-bg-subtle: #242728;
        --rt-border: #3d4143;
        --rt-text: #f2f4f5;
        --rt-muted: #a8b3b8;
        --rt-danger: #f04438;
        --rt-warning: #f79009;
        --rt-success: #32d583;
        --rt-accent: #ff865c;
      }
      .launcher.paused, .launcher.completed, .launcher.failed { color: #17191a; }
      .notice { background: #3a2219; border-color: #713b21; color: #ffd6ae; }
    }

    @media (max-width: 520px) {
      .panel { bottom: 72px; right: 12px; }
      .launcher { bottom: 14px; right: 14px; }
      .grid { grid-template-columns: 1fr; }
      .compact-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .field.full { grid-column: auto; }
      .summary, .batch-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .run-actions .button { flex: 1 1 calc(50% - 8px); }
    }

    @media (prefers-reduced-motion: reduce) {
      * { animation: none !important; scroll-behavior: auto !important; transition: none !important; }
    }
    [hidden] { display: none !important; }
    .preview-navigation { justify-content: space-between; align-items: center; }
    .preview-navigation .status-line { flex: 1; text-align: center; }
    .item .actions { justify-content: space-between; align-items: center; margin-top: 8px; }
    .item a { color: var(--rt-accent); font-size: 12px; }
    .item-text { margin: 8px 0; }
    .item-text div { white-space: pre-wrap; overflow-wrap: anywhere; padding: 8px 0; }

    .panel { max-height: calc(100dvh - 16px); max-width: calc(100vw - 16px); border-radius: 12px; container-type: inline-size; }
    .header { flex: 0 0 auto; gap: 7px; padding: 11px 12px; cursor: grab; touch-action: none; user-select: none; }
    .header .brand { flex: 1; }
    .brand strong { font-size: 15px; }
    .brand span { font-size: 11px; }
    .brand small { margin-left: 5px; font-size: 10px; opacity: .75; }
    .move-window { cursor: grab; font-size: 24px; width: 24px; }
    .interacting .header, .interacting .move-window { cursor: grabbing; }
    .launcher { touch-action: none; }
    .launcher:hover { transform: none; }
    .content { flex: 1 1 auto; padding: 16px; overscroll-behavior: contain; }
    .account-line { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; margin-bottom: 18px; color: var(--rt-muted); font-size: 12px; }
    .account-line a { color: var(--rt-accent); }
    .section { gap: 11px; margin-bottom: 20px; }
    .section-title h2 { font-size: 14px; letter-spacing: 0; }
    .checks { gap: 20px; }
    .advanced { border-top: 1px solid var(--rt-border); padding-top: 10px; }
    .help { color: var(--rt-muted); font-size: 11px; line-height: 1.5; margin: 0; overflow-wrap: anywhere; }
    .advanced .help { margin: 9px 0; }
    .advanced .utility-actions { margin-top: 12px; }
    .button { border-radius: 7px; min-height: 36px; padding: 7px 12px; font-size: 12px; }
    .scan { width: 100%; }
    .text-button { background: transparent; border-color: transparent; min-height: 26px; padding: 2px 4px; color: var(--rt-accent); }
    .selection-summary { display: flex; gap: 5px 14px; flex-wrap: wrap; font-size: 12px; align-items: baseline; }
    .selection-summary .found-total { color: var(--rt-muted); margin-left: auto; }
    .preview { max-height: none; overflow: visible; border-radius: 8px; }
    .preview-empty { padding: 18px 10px; }
    .item { padding: 11px; gap: 5px; }
    .item .actions { margin-top: 2px; }
    .item-text { margin: 0; font-size: 11px; }
    .item-status.unconfirmed { color: var(--rt-warning); }
    .run-section { flex: 0 0 auto; display: grid; gap: 7px; padding: 12px 20px 20px; border-top: 1px solid var(--rt-border); background: var(--rt-bg); }
    .run-section .current-action { min-height: 0; padding: 0; background: none; border: 0; font-size: 12px; font-weight: 600; }
    .run-section .status-line { font-size: 11px; }
    .batch-summary { display: flex; gap: 6px 16px; flex-wrap: wrap; font-size: 12px; }
    .batch-summary span { white-space: nowrap; }
    .delete-note { margin: 0; color: var(--rt-muted); font-size: 11px; }
    .run-actions { flex-wrap: wrap; }
    .run-actions .start { width: 100%; font-size: 13px; min-height: 40px; }
    .run-actions .pause, .run-actions .stop { flex: 1; }
    .run-details { margin: 12px 0; font-size: 12px; }
    .detail-metrics { display: flex; gap: 10px; flex-wrap: wrap; color: var(--rt-muted); font-size: 11px; margin-bottom: 8px; }
    .resize-handle { position: absolute; bottom: 0; border: 0; background: transparent; color: var(--rt-muted); width: 24px; height: 22px; padding: 0; touch-action: none; opacity: .65; font-size: 17px; z-index: 2; }
    .resize-left { left: 0; cursor: nesw-resize; transform: rotate(90deg); }
    .resize-right { right: 0; cursor: nwse-resize; }
    button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--rt-accent); outline-offset: 2px; }
    .resize-handle:focus-visible { outline-offset: -3px; opacity: 1; }
    @container (max-width: 390px) {
      .grid { grid-template-columns: 1fr; }
      .compact-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .field.full { grid-column: auto; }
      .content { padding: 12px; }
      .selection-summary .found-total { margin-left: 0; }
    }
  `;
})();

/* src/ui/template.js */
(() => {
  'use strict';

  const { UI } = globalThis.RedditToolbox;

  const DEFAULT_SETTINGS = Object.freeze({
    includeComments: true,
    includePosts: true,
    dateMode: 'all',
    fromDate: '',
    throughDate: '',
    maxItems: 0,
    sortOrder: 'oldest',
    keepSubreddits: '',
    keepScoreAtOrAbove: '',
    textIncludes: '',
    deleteUneditablePosts: false,
    verifyOverwrite: true,
    replacementLength: 24,
    minimumDelaySeconds: 4.5,
    maximumDelaySeconds: 8.5,
    continueOnFailure: true,
    maxConsecutiveFailures: 5
  });

  const staticMarkup = String.raw`
    <button class="launcher" type="button" title="Open Reddit Toolbox · drag to move" aria-label="Open Reddit Toolbox" aria-expanded="false" aria-controls="rt-panel">
      <span class="launcher-label">RT</span><span class="launcher-badge" hidden></span>
    </button>
    <aside class="panel" id="rt-panel" role="dialog" aria-label="Reddit Toolbox" aria-modal="false">
      <header class="header">
        <button class="icon-button move-window" type="button" aria-label="Move window" title="Drag to move. Arrow keys move; Shift moves farther.">⠿</button>
        <div class="brand"><strong>Reddit Toolbox</strong><span>Your Reddit history <small>RC6</small></span></div>
        <button class="icon-button reset-window" type="button" aria-label="Reset window layout" title="Reset size and position">↺</button>
        <button class="icon-button close" type="button" aria-label="Close">✕</button>
      </header>
      <div class="content">
        <div class="account-line"><span class="account-status" role="status">Uses your signed-in Reddit account</span><a class="canonical-link" href="https://www.reddit.com/" target="_blank" rel="noopener noreferrer">Open www.reddit.com</a></div>
        <section class="section scope-section">
          <div class="section-title"><h2>What would you like to delete?</h2></div>
          <div class="checks"><label class="check"><input id="include-comments" type="checkbox"> Comments</label><label class="check"><input id="include-posts" type="checkbox"> Posts</label></div>
          <div class="grid">
            <div class="field full"><label for="date-mode">Date range</label><select id="date-mode"><option value="all">All time</option><option value="before">Before a date</option><option value="after">After a date</option><option value="between">Between dates</option></select></div>
            <div class="field from-field"><label for="from-date">From</label><input id="from-date" type="date"></div>
            <div class="field through-field"><label for="through-date">Through</label><input id="through-date" type="date"></div>
            <div class="field"><label for="limit-mode">Limit</label><select id="limit-mode"><option value="all">No limit</option><option value="count">Set a limit</option></select><div class="field amount-field" hidden><label for="max-items">Number of items</label><input id="max-items" type="number" min="1" max="100000" step="1" inputmode="numeric" value="100"></div></div>
            <div class="field"><label for="sort-order">Order</label><select id="sort-order"><option value="oldest">Oldest first</option><option value="newest">Newest first</option></select></div>
          </div>
          <details class="advanced"><summary>More options</summary>
            <div class="grid">
              <div class="field full"><label for="keep-subreddits">Keep these subreddits</label><input id="keep-subreddits" type="text" placeholder="askscience, personalfinance"></div>
              <div class="field"><label for="keep-score">Keep score at or above</label><input id="keep-score" type="number" step="1" placeholder="No score filter"></div>
              <div class="field"><label for="text-includes">Only matching text</label><input id="text-includes" type="text" placeholder="Optional phrase"></div>
              <div class="field full"><label>Seconds between items</label><div class="grid compact-grid"><input id="minimum-delay" type="number" min="1" max="300" step="0.5" aria-label="Minimum delay seconds"><input id="maximum-delay" type="number" min="1" max="300" step="0.5" aria-label="Maximum delay seconds"></div></div>
            </div>
            <label class="check"><input id="delete-uneditable" type="checkbox"> Also delete link and media posts</label>
            <p class="help">Link and media posts have no body to overwrite. Post titles stay unchanged. Reddit rate limits are handled automatically.</p>
            <div class="actions utility-actions"><button class="button import" type="button">Import archive CSV</button><button class="button check-login" type="button">Check login</button><button class="button clear-history" type="button">Clear loaded history</button></div>
            <input class="file-input archive-input" type="file" accept=".csv,text/csv" multiple>
            <p class="help">Profile history can omit older items. Import comments.csv or posts.csv from your Reddit archive to include them.</p>
          </details>
          <button class="button primary scan" type="button">Find matching items</button>
          <div class="status-line scan-status" role="status">Review the matches before deleting.</div>
        </section>
        <section class="section preview-section" hidden>
          <div class="section-title"><h2>Review</h2><button class="button text-button export-backup" type="button" disabled>Save a copy</button></div>
          <div class="selection-summary"><span><strong class="selected-count">0</strong> selected</span><span><strong class="comment-count">0</strong> comments · <strong class="post-count">0</strong> posts</span><span class="found-total">from <strong class="found-count">0</strong> found</span></div>
          <div class="preview-caption help">No items loaded</div>
          <div class="preview"><div class="preview-empty">Find matching items to review them.</div></div>
          <div class="actions preview-navigation" hidden><button class="button preview-previous" type="button">Previous</button><span class="preview-page help" role="status"></span><button class="button preview-next" type="button">Next</button></div>
        </section>
        <details class="run-details" hidden><summary>Run details</summary>
          <div class="detail-metrics"><span><strong class="processed-count">0</strong> processed</span><span><strong class="remaining-count">0</strong> remaining</span><span><strong class="skipped-count">0</strong> skipped</span><span class="current-count">—</span><span class="elapsed-time">0s</span></div>
          <div class="log">No run activity.</div><button class="button export-log" type="button" disabled>Save run log</button>
        </details>
      </div>
      <footer class="run-section">
        <div class="batch-summary" hidden aria-live="polite"><span><strong class="deleted-count">0</strong> deleted</span><span><strong class="unconfirmed-count">0</strong> need recheck</span><span><strong class="failed-count">0</strong> failed</span></div>
        <div class="current-action" hidden></div><progress class="progress" value="0" max="1" aria-label="Cleanup progress" hidden></progress>
        <div class="status-line run-status" role="status">Find items to get started.</div>
        <p class="delete-note" hidden>Editable text is overwritten first. Deletion is permanent.</p>
        <div class="actions run-actions"><button class="button danger start" type="button" disabled>Delete selected items</button><button class="button pause" type="button" hidden>Pause</button><button class="button stop" type="button" title="Finish the current item, then stop" hidden>Stop</button><button class="button recheck" type="button" hidden>Recheck results</button><button class="button retry" type="button" hidden>Review retries</button></div>
      </footer>
      <button class="resize-handle resize-left" data-edge="left" type="button" aria-label="Resize window from left" title="Drag to resize. Arrow keys also resize.">◢</button>
      <button class="resize-handle resize-right" data-edge="right" type="button" aria-label="Resize window from right" title="Drag to resize. Arrow keys also resize.">◢</button>
    </aside>
  `;

  function dateLabel(timestamp) {
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  function safeFilenamePart(value) {
    return String(value || 'reddit').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'reddit';
  }

  function compactError(error) {
    return error?.message || String(error || 'Unknown error');
  }

  UI.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
  UI.staticMarkup = staticMarkup;
  UI.dateLabel = dateLabel;
  UI.safeFilenamePart = safeFilenamePart;
  UI.compactError = compactError;
})();

/* src/ui/window.js */
(() => {
  'use strict';
  const { UI } = globalThis.RedditToolbox;
  const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);
  const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;

  function fitWindow(rect = {}, viewportWidth = 1024, viewportHeight = 768) {
    const maxWidth = Math.max(1, viewportWidth - 16);
    const maxHeight = Math.max(1, viewportHeight - 16);
    const width = clamp(finite(rect.width, 520), Math.min(320, maxWidth), maxWidth);
    const height = clamp(finite(rect.height, Math.min(740, viewportHeight - 100)), Math.min(360, maxHeight), maxHeight);
    return {
      width, height,
      left: clamp(finite(rect.left, viewportWidth - width - 20), 8, Math.max(8, viewportWidth - width - 8)),
      top: clamp(finite(rect.top, viewportHeight - height - 80), 8, Math.max(8, viewportHeight - height - 8))
    };
  }

  class ToolboxWindow {
    constructor(app) {
      this.app = app;
      this.panel = app.refs.panel;
      this.launcher = app.refs.launcher;
      this.layout = app.store.get('window-layout', {}) || {};
      this.launcherLayout = app.store.get('launcher-layout', {}) || {};
      this.drag = null;
      this.suppressLauncherClick = false;
      const root = app.shadow;
      const move = root.querySelector('.move-window');
      root.querySelector('.header').addEventListener('pointerdown', event => {
        if (!event.target.closest('button, a, input') || event.target.closest('.move-window')) this.begin(event, 'move');
      });
      for (const handle of root.querySelectorAll('.resize-handle')) {
        handle.addEventListener('pointerdown', event => this.begin(event, handle.dataset.edge));
        handle.addEventListener('keydown', event => this.keyboard(event, handle.dataset.edge));
      }
      move.addEventListener('keydown', event => this.keyboard(event, 'move'));
      this.launcher.addEventListener('pointerdown', event => this.begin(event, 'launcher'));
      this.launcher.addEventListener('click', event => {
        if (!this.suppressLauncherClick) return;
        this.suppressLauncherClick = false;
        event.preventDefault();
        event.stopImmediatePropagation();
      }, true);
      globalThis.addEventListener('pointermove', event => this.move(event));
      globalThis.addEventListener('pointerup', event => this.finish(event));
      globalThis.addEventListener('pointercancel', event => this.finish(event));
      globalThis.addEventListener('resize', () => this.apply());
      globalThis.visualViewport?.addEventListener('resize', () => this.apply());
      root.querySelector('.reset-window').addEventListener('click', () => this.reset());
      this.apply();
    }

    viewport() {
      return { width: globalThis.visualViewport?.width || innerWidth, height: globalThis.visualViewport?.height || innerHeight };
    }

    apply() {
      const viewport = this.viewport();
      const rect = fitWindow(this.layout, viewport.width, viewport.height);
      Object.assign(this.panel.style, Object.fromEntries(Object.entries(rect).map(([key, value]) => [key, value + 'px'])));
      this.panel.style.right = 'auto';
      this.panel.style.bottom = 'auto';
      const left = clamp(finite(this.launcherLayout.left, viewport.width - 68), 8, Math.max(8, viewport.width - 56));
      const top = clamp(finite(this.launcherLayout.top, viewport.height - 68), 8, Math.max(8, viewport.height - 56));
      Object.assign(this.launcher.style, { left: left + 'px', top: top + 'px', right: 'auto', bottom: 'auto' });
    }

    begin(event, mode) {
      if (event.button !== 0 || this.drag) return;
      if (mode !== 'launcher') event.preventDefault();
      const element = mode === 'launcher' ? this.launcher : this.panel;
      const rect = element.getBoundingClientRect();
      this.drag = { mode, id: event.pointerId, x: event.clientX, y: event.clientY, rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }, target: event.target, moved: false };
      event.target.setPointerCapture?.(event.pointerId);
      this.panel.classList.add('interacting');
    }

    move(event) {
      const drag = this.drag;
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) < 5 && !drag.moved) return;
      drag.moved = true;
      this.change(drag.rect, drag.mode, dx, dy);
    }

    change(rect, mode, dx, dy) {
      if (mode === 'launcher') this.launcherLayout = { left: rect.left + dx, top: rect.top + dy };
      else if (mode === 'move') this.layout = { ...rect, left: rect.left + dx, top: rect.top + dy };
      else {
        const viewport = this.viewport();
        const right = rect.left + rect.width;
        const left = mode === 'left' ? clamp(rect.left + dx, 8, right - Math.min(320, viewport.width - 16)) : rect.left;
        this.layout = { ...rect, left, width: mode === 'left' ? right - left : clamp(rect.width + dx, Math.min(320, viewport.width - 16), viewport.width - rect.left - 8), height: clamp(rect.height + dy, Math.min(360, viewport.height - 16), viewport.height - rect.top - 8) };
      }
      this.apply();
    }

    finish(event) {
      if (!this.drag || event.pointerId !== this.drag.id) return;
      if (this.drag.moved) {
        this.suppressLauncherClick = this.drag.mode === 'launcher' && event.type !== 'pointercancel';
        this.save();
      }
      if (this.drag.target.hasPointerCapture?.(event.pointerId)) this.drag.target.releasePointerCapture(event.pointerId);
      this.drag = null;
      this.panel.classList.remove('interacting');
    }

    keyboard(event, mode) {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const amount = event.shiftKey ? 50 : 10;
      const rect = this.panel.getBoundingClientRect();
      this.change({ left: rect.left, top: rect.top, width: rect.width, height: rect.height }, mode,
        event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0,
        event.key === 'ArrowUp' ? -amount : event.key === 'ArrowDown' ? amount : 0);
      this.save();
    }

    save() {
      const viewport = this.viewport();
      this.layout = fitWindow(this.layout, viewport.width, viewport.height);
      this.app.store.set('window-layout', this.layout);
      this.app.store.set('launcher-layout', this.launcherLayout);
    }

    reset() {
      this.layout = {};
      this.launcherLayout = {};
      this.app.store.remove('window-layout');
      this.app.store.remove('launcher-layout');
      this.apply();
    }
  }

  UI.fitWindow = fitWindow;
  UI.ToolboxWindow = ToolboxWindow;
})();

/* src/ui/app.js */
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
      this.rechecking = false;
      this.recheckCancelled = false;
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
      this.updateLimitFields();
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
        fromField: $('.from-field'), throughField: $('.through-field'), maxItems: $('#max-items'), limitMode: $('#limit-mode'), amountField: $('.amount-field'),
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
      this.refs.limitMode.addEventListener('change', () => this.updateLimitFields());
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
      this.refs.limitMode.value = settings.maxItems > 0 ? 'count' : 'all';
      this.refs.maxItems.value = settings.maxItems || '100';
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
        maxItems: this.refs.limitMode.value === 'all' ? 0 : Math.max(1, Math.min(100_000, Math.trunc(Number(this.refs.maxItems.value) || 1))),
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

    updateLimitFields() {
      this.refs.amountField.hidden = this.refs.limitMode.value === 'all';
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

/* src/ui/scope.js */
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

/* src/ui/run.js */
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

/* src/main.js */
(() => {
  'use strict';

  const toolbox = globalThis.RedditToolbox;
  toolbox.App ||= {};

  toolbox.App.start = () => {
    if (globalThis.__redditToolboxApp) return globalThis.__redditToolboxApp;
    const app = new toolbox.UI.RedditToolboxApp().mount();
    globalThis.__redditToolboxApp = app;
    if (typeof GM_registerMenuCommand === 'function') {
      GM_registerMenuCommand('Open Reddit Toolbox', () => app.open());
    }
    return app;
  };

  const boot = () => {
    if (document.body) toolbox.App.start();
    else document.addEventListener('DOMContentLoaded', () => toolbox.App.start(), { once: true });
  };

  if (typeof document !== 'undefined') boot();
})();

