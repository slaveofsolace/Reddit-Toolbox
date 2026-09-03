// ==UserScript==
// @name         Reddit Toolbox
// @namespace    https://github.com/slaveofsolace
// @version      1.0.0-rc.2
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
  family.version = '1.0.0-rc.2';

  const toolbox = globalThis.RedditToolbox || {};
  toolbox.Core = family.Core;
  toolbox.Reddit ||= {};
  toolbox.UI ||= {};
  toolbox.version = '1.0.0-rc.2';

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
      stopped: 0,
      processed: 0,
      remaining: 0,
      percent: 0
    };
    for (const item of plan?.items || []) {
      summary[item.status] = (summary[item.status] || 0) + 1;
    }
    summary.processed = summary.completed + summary.skipped + summary.failed;
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
        summary.processed = summary.completed + summary.skipped + summary.failed;
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
        plan.status = this.summary.failed ? 'completed-with-failures' : 'completed';
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
    if (!header) return fallback;
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
      const payload = await this.getJson('/api/me.json?raw_json=1');
      const data = payload?.data;
      if (!data?.name) throw new Core.AuthError();
      this.username = String(data.name);
      this.modhash = String(data.modhash || '');
      if (requireModhash && !this.modhash) {
        throw new Core.AuthError(
          'The provisional session adapter did not receive an action token. Live access requires approved OAuth setup.',
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

    async isDeleted(fullname) {
      const child = await this.getThing(fullname);
      if (!child) return false;
      const author = String(child.data?.author || '').toLowerCase();
      const text = String(child.kind === 't1' ? child.data?.body ?? '' : child.data?.selftext ?? '').toLowerCase();
      return author === '[deleted]' && ['', '[deleted]'].includes(text);
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
          deleteSent: false
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

    async verifyDeleted(item, state) {
      if (!this.verifyDeletion) return true;
      if (typeof this.client.isDeleted !== 'function') {
        throw new Core.PauseRequiredError(
          'The delete request was sent, but this adapter cannot verify the result.',
          { code: 'DELETE_RESULT_UNVERIFIED' }
        );
      }
      const deleted = await this.verifyWithRetries(() => this.client.isDeleted(item.fullname));
      if (!deleted) {
        throw new Core.PauseRequiredError(
          'The delete request was sent, but Reddit has not confirmed the result. Inspect the item before resuming.',
          { code: 'DELETE_RESULT_UNCERTAIN' }
        );
      }
      state.completed = true;
      return true;
    }

    isAmbiguousMutationError(error) {
      return ['NETWORK_ERROR', 'RESPONSE_LOST', 'INVALID_JSON', 'UNRECOGNIZED_RESPONSE'].includes(error?.code)
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
        await this.verifyDeleted(item, state);
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
        state.deleteSent = true;
        try {
          await this.client.delete(item.fullname);
        } catch (error) {
          if (!this.isAmbiguousMutationError(error)) {
            state.deleteSent = false;
            throw error;
          }
        }
        this.report(context, 'verifying-deletion');
        await this.verifyDeleted(item, state);
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
      state.deleteSent = true;
      try {
        await this.client.delete(item.fullname);
      } catch (error) {
        if (!this.isAmbiguousMutationError(error)) {
          state.deleteSent = false;
          throw error;
        }
      }
      this.report(context, 'verifying-deletion');
      await this.verifyDeleted(item, state);
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
    <button class="launcher" type="button" title="Open Reddit Toolbox" aria-label="Open Reddit Toolbox" aria-expanded="false" aria-controls="rt-panel">
      <span class="launcher-label">RT</span>
      <span class="launcher-badge" hidden></span>
    </button>
    <aside class="panel" id="rt-panel" role="dialog" aria-label="Reddit Toolbox" aria-modal="false">
      <header class="header">
        <div class="brand">
          <strong>Reddit Toolbox</strong>
          <span>Automated history cleanup · RC2</span>
        </div>
        <button class="icon-button close" type="button" aria-label="Close">✕</button>
      </header>

      <div class="content">
        <section class="section">
          <div class="notice">
            One confirmation starts the entire selected batch. No per-item clicks are required. Keep this tab open; the batch continues while this panel is closed.
          </div>
          <div class="status-line">Live connection is pending Reddit API approval and OAuth setup. Local archive import is available.</div>
        </section>

        <section class="section scope-section">
          <div class="section-title"><h2>1. Scope</h2><span>Choose what can be touched</span></div>
          <div class="checks">
            <label class="check"><input id="include-comments" type="checkbox"> Comments</label>
            <label class="check"><input id="include-posts" type="checkbox"> Posts</label>
          </div>

          <div class="grid">
            <div class="field full">
              <label for="date-mode">Time frame</label>
              <select id="date-mode">
                <option value="all">All available history</option>
                <option value="before">On or before a date</option>
                <option value="after">On or after a date</option>
                <option value="between">Between two dates</option>
              </select>
            </div>
            <div class="field from-field">
              <label for="from-date">From</label>
              <input id="from-date" type="date">
            </div>
            <div class="field through-field">
              <label for="through-date">Through</label>
              <input id="through-date" type="date">
            </div>
            <div class="field">
              <label for="max-items">Maximum items</label>
              <input id="max-items" type="number" min="0" max="100000" step="1" inputmode="numeric" placeholder="0 = all">
            </div>
            <div class="field">
              <label for="sort-order">Process order</label>
              <select id="sort-order">
                <option value="oldest">Oldest first</option>
                <option value="newest">Newest first</option>
              </select>
            </div>
          </div>

          <details class="advanced">
            <summary>Advanced</summary>
            <div class="grid">
            <div class="field full">
              <label for="keep-subreddits">Keep these subreddits</label>
              <input id="keep-subreddits" type="text" placeholder="askscience, personalfinance">
            </div>
            <div class="field">
              <label for="keep-score">Keep score at or above</label>
              <input id="keep-score" type="number" step="1" placeholder="Disabled">
            </div>
            <div class="field">
              <label for="text-includes">Only matching text</label>
              <input id="text-includes" type="text" placeholder="Optional phrase">
            </div>
          </div>

          <div class="checks">
            <label class="check" title="Link and media posts have no body to overwrite.">
              <input id="delete-uneditable" type="checkbox"> Delete link/media posts directly
            </label>
          </div>

          <div class="grid">
            <div class="field">
              <label for="replacement-length">Replacement letters</label>
              <input id="replacement-length" type="number" min="8" max="128" step="1">
            </div>
            <div class="field">
              <label for="minimum-delay">Delay range (seconds)</label>
              <div class="grid compact-grid">
                <input id="minimum-delay" type="number" min="1" max="300" step="0.5" aria-label="Minimum delay seconds">
                <input id="maximum-delay" type="number" min="1" max="300" step="0.5" aria-label="Maximum delay seconds">
              </div>
            </div>
          </div>

          <div class="automation-note">
            Reddit Toolbox automatically waits through rate limits, retries temporary failures, and continues past isolated item failures. Five consecutive failures pause the batch for review.
          </div>

          </details>

          <div class="actions">
            <button class="button primary scan" type="button">Scan history</button>
            <button class="button import" type="button">Import archive CSV</button>
            <input class="file-input archive-input" type="file" accept=".csv,text/csv" multiple>
            <button class="button build-preview" type="button">Prepare batch</button>
          </div>
          <div class="status-line scan-status" role="status">Profile listings can omit older history. Import comments.csv and posts.csv to include archive items.</div>
        </section>

        <section class="section preview-section">
          <div class="section-title"><h2>2. Review batch</h2></div>
          <div class="preview-caption status-line">No batch prepared</div>
          <div class="summary">
            <div class="metric"><strong class="found-count">0</strong><span>Found</span></div>
            <div class="metric"><strong class="selected-count">0</strong><span>Selected</span></div>
            <div class="metric"><strong class="comment-count">0</strong><span>Comments</span></div>
            <div class="metric"><strong class="post-count">0</strong><span>Posts</span></div>
          </div>
          <div class="preview"><div class="preview-empty">Scan or import data, then prepare a batch.</div></div>
          <div class="actions">
            <button class="button export-backup" type="button" disabled>Export selected content</button>
            <button class="button export-log" type="button" disabled>Export run log</button>
          </div>
        </section>

        <section class="section run-section">
          <div class="section-title"><h2>3. Automate</h2><span>One confirmation for the whole batch</span></div>
          <div class="confirm">
            <span>Type <code class="confirmation-phrase">DELETE 0 ITEMS</code> once to unlock the complete batch.</span>
            <input class="confirmation-input" type="text" autocomplete="off" spellcheck="false" aria-label="Deletion confirmation">
          </div>
          <div class="batch-summary" aria-live="polite">
            <div class="metric"><strong class="processed-count">0</strong><span>Processed</span></div>
            <div class="metric"><strong class="remaining-count">0</strong><span>Remaining</span></div>
            <div class="metric"><strong class="failed-count">0</strong><span>Failed</span></div>
            <div class="metric"><strong class="current-count">—</strong><span>Current</span></div>
            <div class="metric"><strong class="deleted-count">0</strong><span>Deleted</span></div>
            <div class="metric"><strong class="skipped-count">0</strong><span>Skipped</span></div>
            <div class="metric"><strong class="elapsed-time">0s</strong><span>Elapsed</span></div>
          </div>
          <div class="current-action">Ready to run the selected batch automatically.</div>
          <progress class="progress" value="0" max="1" aria-label="Batch progress"></progress>
          <div class="status-line run-status" role="status">Idle</div>
          <div class="actions run-actions">
            <button class="button danger start" type="button" disabled>Run entire batch</button>
            <button class="button pause" type="button" disabled>Pause batch</button>
            <button class="button stop" type="button" disabled>Stop after current item</button>
            <button class="button retry" type="button" disabled>Prepare retry batch</button>
          </div>
          <details><summary>Run details</summary><div class="log">No run activity.</div></details>
        </section>
      </div>
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
      this.completionResetTimer = null;
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
        deletedCount: $('.deleted-count'), skippedCount: $('.skipped-count'), elapsedTime: $('.elapsed-time'),
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
        const changed = () => {
          if (this.busy) return;
          this.settings = this.readSettingsFromForm();
          this.store.set('settings', this.settings);
          if (this.plan) this.invalidatePlan('Settings changed. Prepare the batch again.');
        };
        input.addEventListener('change', changed);
        input.addEventListener('input', changed);
      }
    }

    open() {
      this.refs.panel.classList.add('open');
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
      if (this.client) return this.client;
      throw new Core.AuthError('Reddit API approval and an approved OAuth connection are required before live scanning or cleanup.', { code: 'API_APPROVAL_REQUIRED' });
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
      const summary = active ? this.runner.progress().summary : Core.planSummary(this.plan);
      const confirmed = Boolean(
        !locked && this.plan
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
      if (state === 'completed' || state === 'completed-with-failures') {
        this.refs.launcher.classList.add(current.failed ? 'failed' : 'completed');
        this.refs.launcherLabel.textContent = current.failed ? '!' : '✓';
        this.refs.launcher.title = current.failed ? 'Batch completed with failures' : 'Batch completed';
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
      const expectedOptions = { ...this.settings, accountId: this.plan.options.accountId };
      if (Core.planDigest(this.plan.items.map((item) => item.content), expectedOptions) !== this.plan.digest || !this.plan.options.accountId) {
        this.invalidatePlan('The account or settings need a fresh review. Prepare the batch again.');
        return;
      }
      this.busy = true;
      this.refreshControls();
      this.logLines = [];
      this.refs.log.textContent = '';
      this.refs.confirmationInput.value = '';
      this.setStatus(this.refs.runStatus, 'Verifying the Reddit session before starting…');
      try {
        const client = this.ensureClient();
        const session = await client.assertSession(this.plan.options.accountId, true);
        this.username = session.username;
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
          await this.ensureClient().assertSession(this.plan.options.accountId, true);
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

