// ==UserScript==
// @name         Reddit Toolbox
// @namespace    https://github.com/slaveofsolace
// @version      1.0.0-rc.1
// @description  Preview, overwrite, and delete your own Reddit posts and comments.
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
// @supportURL   https://github.com/slaveofsolace/Insta-Toolbox/issues
// @downloadURL  https://raw.githubusercontent.com/slaveofsolace/Reddit-Toolbox/main/userscripts/reddit-toolbox.user.js
// @updateURL    https://raw.githubusercontent.com/slaveofsolace/Reddit-Toolbox/main/userscripts/reddit-toolbox.user.js
// ==/UserScript==

/* src/core/namespace.js */
(() => {
  'use strict';

  const family = globalThis.ToolboxFamily || {};
  family.Core ||= {};
  family.version = '1.0.0-rc.1';

  const toolbox = globalThis.RedditToolbox || {};
  toolbox.Core = family.Core;
  toolbox.Reddit ||= {};
  toolbox.UI ||= {};
  toolbox.version = '1.0.0-rc.1';

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

    return Math.floor(Math.random() * maxExclusive);
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

  function parseCsv(text) {
    const source = String(text || '').replace(/^\uFEFF/, '');
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;

    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];

      if (quoted) {
        if (char === '"' && source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else if (char === '"') {
          quoted = false;
        } else {
          field += char;
        }
        continue;
      }

      if (char === '"') {
        quoted = true;
      } else if (char === ',') {
        row.push(field);
        field = '';
      } else if (char === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else if (char !== '\r') {
        field += char;
      }
    }

    if (quoted) throw new Error('The CSV file ends inside a quoted field.');
    if (field.length > 0 || row.length > 0) {
      row.push(field);
      rows.push(row);
    }

    while (rows.length && rows[rows.length - 1].every((value) => value === '')) {
      rows.pop();
    }
    if (!rows.length) return [];

    const headers = rows.shift().map((header, index) => {
      const normalized = header.trim().toLowerCase().replace(/\s+/g, '_');
      return normalized || `column_${index + 1}`;
    });

    return rows
      .filter((values) => values.some((value) => value !== ''))
      .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])));
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

  function fnv1a(value) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function planDigest(items, options = {}) {
    const settings = [
      options.deleteUneditablePosts === true ? 'direct-delete' : 'overwrite-only',
      options.verifyOverwrite !== false ? 'verify' : 'no-verify',
      Number(options.replacementLength) || 24
    ].join('|');
    const targets = (items || []).map((item) => (
      `${item.kind}:${item.fullname}:${item.editable === false ? 'direct' : 'editable'}`
    )).join('\n');
    return fnv1a(`${settings}\n${targets}`);
  }

  function createPlan(items, options = {}, now = Date.now()) {
    const targets = Array.from(items || []);
    const digest = planDigest(targets, options);
    return {
      id: `plan-${now}-${digest}`,
      createdAt: new Date(now).toISOString(),
      digest,
      confirmation: `DELETE ${targets.length} ${targets.length === 1 ? 'ITEM' : 'ITEMS'}`,
      options: {
        deleteUneditablePosts: options.deleteUneditablePosts === true,
        verifyOverwrite: options.verifyOverwrite !== false,
        replacementLength: Math.max(8, Math.min(128, Math.trunc(Number(options.replacementLength) || 24)))
      },
      items: targets.map((content, index) => ({
        id: `${digest}:${index}:${content.fullname}`,
        content,
        status: 'ready',
        attempts: 0,
        startedAt: null,
        finishedAt: null,
        outcome: null,
        error: null
      }))
    };
  }

  function isPlanCurrent(plan) {
    if (!plan?.items || !Array.isArray(plan.items)) return false;
    return plan.digest === planDigest(plan.items.map((item) => item.content), plan.options);
  }

  function planSummary(plan) {
    const summary = {
      total: plan?.items?.length || 0,
      ready: 0,
      processing: 0,
      completed: 0,
      skipped: 0,
      failed: 0,
      stopped: 0
    };
    for (const item of plan?.items || []) {
      summary[item.status] = (summary[item.status] || 0) + 1;
    }
    return summary;
  }

  Core.fnv1a = fnv1a;
  Core.planDigest = planDigest;
  Core.createPlan = createPlan;
  Core.isPlanCurrent = isPlanCurrent;
  Core.planSummary = planSummary;
})();

/* src/core/runner.js */
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
    let rawId = row.fullname || row.name || row.id || row.comment_id || row.post_id || '';
    if (!rawId && permalink) {
      const match = permalink.match(/\/comments\/([a-z0-9]+)(?:\/[^/]+)?(?:\/([a-z0-9]+))?/i);
      rawId = kind === 'comment' ? match?.[2] || '' : match?.[1] || '';
    }
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
      score: Number.isFinite(Number(row.score)) ? Number(row.score) : null,
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
    for (const item of collections.flat()) {
      if (!item?.fullname) continue;
      const current = merged.get(item.fullname);
      if (!current) {
        merged.set(item.fullname, { ...item });
        continue;
      }
      const profile = item.source === 'profile' ? item : current.source === 'profile' ? current : null;
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

  class RedditSessionClient {
    constructor(options = {}) {
      const defaultFetch = globalThis.fetch?.bind(globalThis);
      this.fetch = options.fetchImpl || defaultFetch;
      this.origin = options.origin || globalThis.location?.origin || 'https://www.reddit.com';
      this.modhash = options.modhash || '';
      this.username = options.username || '';
      if (typeof this.fetch !== 'function') throw new Error('Fetch is unavailable.');
    }

    url(path) {
      const url = new URL(path, this.origin);
      if (!/(^|\.)reddit\.com$/i.test(url.hostname)) {
        throw new Error('Reddit Toolbox only sends requests to reddit.com.');
      }
      return url;
    }

    async readResponse(response) {
      const contentType = response.headers?.get?.('content-type') || '';
      const text = await response.text();
      let payload = null;
      if (text && (contentType.includes('json') || /^[\s]*[\[{]/.test(text))) {
        try {
          payload = JSON.parse(text);
        } catch {
          throw new Core.ApiError('Reddit returned malformed JSON.', {
            code: 'INVALID_JSON',
            status: response.status,
            retryable: response.status >= 500
          });
        }
      }

      if (response.status === 429) {
        throw new Core.RateLimitError(
          'Reddit asked the tool to slow down.',
          retryAfterMilliseconds(response)
        );
      }
      if (response.status === 401) {
        throw new Core.AuthError('Your Reddit session expired. Sign in again, then resume.', {
          status: response.status
        });
      }
      if (response.status === 403) {
        throw new Core.PauseRequiredError(
          'Reddit blocked this request. Check the page for a challenge or account notice, then resume.',
          { code: 'REDDIT_FORBIDDEN', status: response.status }
        );
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

      return payload;
    }

    async getJson(path) {
      let response;
      try {
        response = await this.fetch(this.url(path), {
          method: 'GET',
          credentials: 'include',
          headers: { Accept: 'application/json' }
        });
      } catch (error) {
        throw new Core.ApiError('Could not reach Reddit.', {
          code: 'NETWORK_ERROR',
          retryable: true,
          details: error
        });
      }
      return this.readResponse(response);
    }

    async postForm(path, values) {
      if (!this.modhash) throw new Core.AuthError('Reddit did not provide a session modhash. Refresh and sign in again.');
      const body = new URLSearchParams({ ...values, uh: this.modhash });
      let response;
      try {
        response = await this.fetch(this.url(path), {
          method: 'POST',
          credentials: 'include',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            'X-Modhash': this.modhash
          },
          body
        });
      } catch (error) {
        throw new Core.ApiError('Could not reach Reddit.', {
          code: 'NETWORK_ERROR',
          retryable: true,
          details: error
        });
      }
      return this.readResponse(response);
    }

    async getSession(requireModhash = false) {
      const payload = await this.getJson('/api/me.json?raw_json=1');
      const data = payload?.data;
      if (!data?.name) throw new Core.AuthError();
      this.username = String(data.name);
      this.modhash = String(data.modhash || '');
      if (requireModhash && !this.modhash) {
        throw new Core.AuthError(
          'Reddit found the signed-in account but did not expose an action token on this surface. Open old.reddit.com, reload, and retry.',
          { code: 'MODHASH_MISSING' }
        );
      }
      return { username: this.username, modhash: this.modhash };
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
      const children = Array.isArray(payload?.data?.children) ? payload.data.children : [];
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
      const params = new URLSearchParams({ id: fullname, raw_json: '1' });
      const payload = await this.getJson(`/api/info.json?${params}`);
      const child = payload?.data?.children?.[0];
      if (!child || !['t1', 't3'].includes(child.kind)) return null;
      const actualFullname = Reddit.normalizeFullname(
        child.data?.name || child.data?.id,
        child.kind === 't1' ? 'comment' : 'post'
      );
      return actualFullname === fullname ? child : null;
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
      if (!child) return true;
      const author = String(child.data?.author || '').toLowerCase();
      const text = String(child.kind === 't1' ? child.data?.body ?? '' : child.data?.selftext ?? '').toLowerCase();
      return (!author || author === '[deleted]') && ['', '[deleted]', '[removed]'].includes(text);
    }

    async delete(fullname) {
      return this.postForm('/api/del', { id: fullname });
    }
  }

  Reddit.retryAfterMilliseconds = retryAfterMilliseconds;
  Reddit.rateLimitFromMessage = rateLimitFromMessage;
  Reddit.apiErrors = apiErrors;
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

  Reddit.RedditScanner = RedditScanner;
  Reddit.importArchiveCsv = importArchiveCsv;
})();

/* src/reddit/removal-service.js */
(() => {
  'use strict';

  const { Core, Reddit } = globalThis.RedditToolbox;

  class RedditRemovalService {
    constructor(client, options = {}) {
      this.client = client;
      this.deleteUneditablePosts = options.deleteUneditablePosts === true;
      this.verifyOverwrite = options.verifyOverwrite !== false;
      this.verifyOwnership = options.verifyOwnership !== false;
      this.verifyDeletion = options.verifyDeletion !== false;
      this.replacementLength = Math.max(8, Math.min(128, Number(options.replacementLength) || 24));
      this.minimumSettleMs = Math.max(250, Number(options.minimumSettleMs) || 900);
      this.maximumSettleMs = Math.max(this.minimumSettleMs, Number(options.maximumSettleMs) || 1_500);
      this.verificationAttempts = Math.max(1, Math.min(5, Math.trunc(Number(options.verificationAttempts) || 3)));
      this.verificationDelayMs = Math.max(100, Number(options.verificationDelayMs) || 750);
      this.sleep = options.sleep || Core.wait;
      this.random = options.random || Math.random;
      this.randomSource = options.randomSource || globalThis.crypto;
      this.states = new Map();
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

    async ensureOwnership(item, state) {
      if (!this.verifyOwnership || state.ownershipVerified) return;
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
      this.states.delete(item.fullname);
      return true;
    }

    isAmbiguousMutationError(error) {
      return error?.code === 'NETWORK_ERROR' || (error?.retryable && Number(error?.status) >= 500);
    }

    async remove(item) {
      const directDelete = item.kind === 'post' && item.editable === false;
      if (directDelete && !this.deleteUneditablePosts) {
        return {
          status: 'skipped',
          reason: 'post-has-no-editable-body',
          overwritten: false,
          deleted: false
        };
      }

      const state = this.stateFor(item.fullname);
      if (state.deleteSent) {
        await this.verifyDeleted(item, state);
        return {
          status: 'completed',
          reason: directDelete ? 'deleted-uneditable-post' : 'overwritten-and-deleted',
          overwritten: !directDelete,
          verified: directDelete ? false : this.verifyOverwrite,
          deleted: true
        };
      }

      await this.ensureOwnership(item, state);

      if (directDelete) {
        state.deleteSent = true;
        try {
          await this.client.delete(item.fullname);
        } catch (error) {
          if (!this.isAmbiguousMutationError(error)) {
            state.deleteSent = false;
            throw error;
          }
        }
        await this.verifyDeleted(item, state);
        return {
          status: 'completed',
          reason: 'deleted-uneditable-post',
          overwritten: false,
          verified: false,
          deleted: true
        };
      }

      if (!state.replacement) {
        state.replacement = Core.randomLetterString(this.replacementLength, this.randomSource);
      }

      if (state.editSent && !state.edited) {
        const alreadySaved = await this.verifyWithRetries(
          () => this.client.verifyText(item.fullname, state.replacement)
        );
        if (alreadySaved) state.edited = true;
        else state.editSent = false;
      }

      if (!state.edited) {
        state.editSent = true;
        try {
          await this.client.edit(item.fullname, state.replacement);
          state.edited = true;
        } catch (error) {
          if (!this.isAmbiguousMutationError(error)) {
            state.editSent = false;
            throw error;
          }
          const saved = await this.verifyWithRetries(
            () => this.client.verifyText(item.fullname, state.replacement)
          );
          if (!saved) {
            state.editSent = false;
            throw error;
          }
          state.edited = true;
        }
      }

      const settleMs = Core.randomBetween(this.minimumSettleMs, this.maximumSettleMs, this.random);
      await this.sleep(settleMs);

      if (this.verifyOverwrite) {
        const verified = await this.verifyWithRetries(
          () => this.client.verifyText(item.fullname, state.replacement)
        );
        if (!verified) {
          throw new Core.ApiError('The overwrite could not be verified, so the item was not deleted.', {
            code: 'OVERWRITE_NOT_VERIFIED',
            retryable: true
          });
        }
      }

      state.deleteSent = true;
      try {
        await this.client.delete(item.fullname);
      } catch (error) {
        if (!this.isAmbiguousMutationError(error)) {
          state.deleteSent = false;
          throw error;
        }
      }
      await this.verifyDeleted(item, state);
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
      --rt-accent: #ff4500;
      --rt-accent-hover: #e03d00;
      --rt-bg: #ffffff;
      --rt-bg-subtle: #f6f7f8;
      --rt-border: #d6d9dc;
      --rt-text: #1c1c1c;
      --rt-muted: #576f76;
      --rt-danger: #b42318;
      --rt-success: #067647;
      color: var(--rt-text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 14px;
      line-height: 1.45;
    }

    * { box-sizing: border-box; }
    button, input, select, textarea { font: inherit; }
    button { cursor: pointer; }
    button:disabled { cursor: not-allowed; opacity: .5; }

    .launcher {
      align-items: center;
      background: var(--rt-accent);
      border: 0;
      border-radius: 999px;
      bottom: 20px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, .22);
      color: white;
      display: flex;
      font-size: 13px;
      font-weight: 750;
      height: 48px;
      justify-content: center;
      letter-spacing: .02em;
      position: fixed;
      right: 20px;
      width: 48px;
      z-index: 2147483646;
    }

    .launcher:hover { background: var(--rt-accent-hover); }

    .panel {
      background: var(--rt-bg);
      border: 1px solid var(--rt-border);
      border-radius: 16px;
      bottom: 80px;
      box-shadow: 0 18px 60px rgba(0, 0, 0, .28);
      display: none;
      max-height: min(820px, calc(100vh - 110px));
      overflow: hidden;
      position: fixed;
      right: 20px;
      width: min(470px, calc(100vw - 24px));
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

    .content { overflow: auto; padding: 16px; }
    .section { display: grid; gap: 12px; margin-bottom: 20px; }
    .section:last-child { margin-bottom: 0; }
    .section-title { align-items: baseline; display: flex; justify-content: space-between; }
    .section-title h2 { font-size: 14px; margin: 0; }
    .section-title span { color: var(--rt-muted); font-size: 12px; }

    .notice {
      background: #fff4ed;
      border: 1px solid #ffd6ae;
      border-radius: 10px;
      color: #7a2e0e;
      font-size: 12px;
      padding: 10px 12px;
    }

    .grid { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
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
      outline: 3px solid color-mix(in srgb, var(--rt-accent) 28%, transparent);
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
    .button.primary { background: var(--rt-accent); border-color: var(--rt-accent); color: white; }
    .button.primary:hover:not(:disabled) { background: var(--rt-accent-hover); }
    .button.danger { background: var(--rt-danger); border-color: var(--rt-danger); color: white; }
    .button.link { border-color: transparent; padding-inline: 8px; }

    .file-input { display: none; }
    .status-line { color: var(--rt-muted); font-size: 12px; min-height: 18px; }
    .status-line.error { color: var(--rt-danger); }
    .status-line.success { color: var(--rt-success); }

    .summary { display: grid; gap: 8px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .metric { background: var(--rt-bg-subtle); border-radius: 9px; padding: 9px; }
    .metric strong { display: block; font-size: 16px; }
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
    .item-head { align-items: center; display: flex; gap: 7px; }
    .kind { color: var(--rt-accent); font-size: 10px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    .subreddit { font-weight: 700; }
    .date { color: var(--rt-muted); font-size: 11px; margin-left: auto; }
    .snippet { color: var(--rt-muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .item-status { color: var(--rt-muted); font-size: 11px; }
    .item-status.completed { color: var(--rt-success); }
    .item-status.failed { color: var(--rt-danger); }

    .confirm { background: var(--rt-bg-subtle); border-radius: 10px; display: grid; gap: 8px; padding: 12px; }
    .confirm code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; font-weight: 750; }
    .progress { appearance: none; background: var(--rt-bg-subtle); border: 0; border-radius: 999px; height: 7px; overflow: hidden; width: 100%; }
    .progress::-webkit-progress-bar { background: var(--rt-bg-subtle); }
    .progress::-webkit-progress-value { background: var(--rt-accent); }
    .progress::-moz-progress-bar { background: var(--rt-accent); }

    .log { background: var(--rt-bg-subtle); border-radius: 9px; color: var(--rt-muted); font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; max-height: 120px; overflow: auto; padding: 9px; white-space: pre-wrap; }
    .hidden { display: none !important; }

    @media (prefers-color-scheme: dark) {
      :host {
        --rt-bg: #17191a;
        --rt-bg-subtle: #242728;
        --rt-border: #3d4143;
        --rt-text: #f2f4f5;
        --rt-muted: #a8b3b8;
        --rt-danger: #f04438;
        --rt-success: #32d583;
      }
      .notice { background: #3a2219; border-color: #713b21; color: #ffd6ae; }
    }

    @media (max-width: 520px) {
      .panel { bottom: 72px; right: 12px; }
      .launcher { bottom: 14px; right: 14px; }
      .grid { grid-template-columns: 1fr; }
      .field.full { grid-column: auto; }
      .summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }

    @media (prefers-reduced-motion: reduce) {
      * { scroll-behavior: auto !important; }
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
    maximumDelaySeconds: 8.5
  });

  const staticMarkup = String.raw`
    <button class="launcher" type="button" title="Open Reddit Toolbox" aria-label="Open Reddit Toolbox">RT</button>
    <aside class="panel" role="dialog" aria-label="Reddit Toolbox" aria-modal="false">
      <header class="header">
        <div class="brand">
          <strong>Reddit Toolbox</strong>
          <span>Local cleanup · RC1</span>
        </div>
        <button class="icon-button close" type="button" aria-label="Close">✕</button>
      </header>

      <div class="content">
        <section class="section">
          <div class="notice">
            Deletion is permanent. Review the preview first. The tool edits eligible text to random letters, verifies the change, then deletes it one item at a time.
          </div>
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
              <div class="grid">
                <input id="minimum-delay" type="number" min="1" max="300" step="0.5" aria-label="Minimum delay seconds">
                <input id="maximum-delay" type="number" min="1" max="300" step="0.5" aria-label="Maximum delay seconds">
              </div>
            </div>
          </div>

          <div class="actions">
            <button class="button primary scan" type="button">Scan profile</button>
            <button class="button import" type="button">Import archive CSV</button>
            <input class="file-input archive-input" type="file" accept=".csv,text/csv" multiple>
            <button class="button build-preview" type="button">Build preview</button>
          </div>
          <div class="status-line scan-status" role="status">For complete history, extract comments.csv and posts.csv from a Reddit data export.</div>
        </section>

        <section class="section preview-section">
          <div class="section-title"><h2>2. Review</h2><span class="preview-caption">No plan built</span></div>
          <div class="summary">
            <div class="metric"><strong class="found-count">0</strong><span>Found</span></div>
            <div class="metric"><strong class="selected-count">0</strong><span>Selected</span></div>
            <div class="metric"><strong class="comment-count">0</strong><span>Comments</span></div>
            <div class="metric"><strong class="post-count">0</strong><span>Posts</span></div>
          </div>
          <div class="preview"><div class="preview-empty">Scan or import data, then build a preview.</div></div>
          <div class="actions">
            <button class="button export-backup" type="button" disabled>Export selected content</button>
            <button class="button export-log" type="button" disabled>Export run log</button>
          </div>
        </section>

        <section class="section run-section">
          <div class="section-title"><h2>3. Run</h2><span>Explicit confirmation required</span></div>
          <div class="confirm">
            <span>Type <code class="confirmation-phrase">DELETE 0 ITEMS</code> to unlock the run.</span>
            <input class="confirmation-input" type="text" autocomplete="off" spellcheck="false" aria-label="Deletion confirmation">
          </div>
          <progress class="progress" value="0" max="1"></progress>
          <div class="status-line run-status" role="status">Idle</div>
          <div class="actions">
            <button class="button danger start" type="button" disabled>Start cleanup</button>
            <button class="button pause" type="button" disabled>Pause</button>
            <button class="button stop" type="button" disabled>Stop</button>
          </div>
          <div class="log">No run activity.</div>
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
      this.plan = null;
      this.runner = null;
      this.username = '';
      this.logLines = [];
      this.busy = false;
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
      return this;
    }

    captureRefs() {
      const $ = (selector) => this.shadow.querySelector(selector);
      this.refs = {
        launcher: $('.launcher'), panel: $('.panel'), close: $('.close'),
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
        progress: $('.progress'), runStatus: $('.run-status'), start: $('.start'),
        pause: $('.pause'), stop: $('.stop'), log: $('.log')
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

      for (const input of this.shadow.querySelectorAll('input, select')) {
        if (input === this.refs.archiveInput || input === this.refs.confirmationInput) continue;
        input.addEventListener('change', () => {
          this.settings = this.readSettingsFromForm();
          this.store.set('settings', this.settings);
          if (this.plan) this.invalidatePlan('Settings changed. Build the preview again.');
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
        maximumDelaySeconds
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

/* src/ui/scope.js */
(() => {
  'use strict';

  const { Core, Reddit, UI } = globalThis.RedditToolbox;

  class ScopeMethods {
    async scanProfile() {
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
        this.invalidatePlan();
        const truncated = [result.report.comments, result.report.posts].some((entry) => entry?.truncated);
        const note = truncated ? ' The scan reached its safety page cap; import your Reddit archive for older items.' : '';
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
      const files = Array.from(fileList || []);
      if (!files.length) return;
      this.busy = true;
      this.refreshControls();
      try {
        const imported = [];
        const messages = [];
        for (const file of files) {
          const result = Reddit.importArchiveCsv(await file.text(), file.name);
          imported.push(...result.items);
          messages.push(`${file.name}: ${result.items.length}/${result.rowCount}`);
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

    buildPreview() {
      try {
        this.settings = this.readSettingsFromForm();
        this.store.set('settings', this.settings);
        const allItems = this.allItems();
        if (!allItems.length) throw new Error('Scan your profile or import Reddit archive CSV files first.');
        const selection = Core.selectItems(allItems, {
          ...this.settings,
          keepSubreddits: this.settings.keepSubreddits
        });
        this.plan = Core.createPlan(selection.selected, this.settings);
        this.plan.selectionSkipped = selection.skipped;
        this.refs.confirmationInput.value = '';
        this.renderPlan();
        this.setStatus(
          this.refs.scanStatus,
          `${selection.selected.length} selected; ${Object.values(selection.skipped).reduce((sum, count) => sum + count, 0)} excluded by filters.`,
          'success'
        );
      } catch (error) {
        this.setStatus(this.refs.scanStatus, UI.compactError(error), 'error');
      }
    }

    invalidatePlan(message = '') {
      this.plan = null;
      this.refs.confirmationInput.value = '';
      this.refs.confirmationPhrase.textContent = 'DELETE 0 ITEMS';
      this.refs.selectedCount.textContent = '0';
      this.refs.commentCount.textContent = '0';
      this.refs.postCount.textContent = '0';
      this.refs.previewCaption.textContent = 'No plan built';
      this.refs.preview.replaceChildren(Object.assign(document.createElement('div'), {
        className: 'preview-empty',
        textContent: 'Build a preview before starting a cleanup.'
      }));
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
      this.refs.previewCaption.textContent = `Plan ${this.plan.digest}`;
      this.refs.confirmationPhrase.textContent = this.plan.confirmation;
      this.refs.preview.replaceChildren();

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
            ? 'Link/media post · direct delete only'
            : 'Ready · overwrite then delete';
          row.append(head, snippet, status);
          this.refs.preview.append(row);
        }
        if (contents.length > 100) {
          this.refs.preview.append(Object.assign(document.createElement('div'), {
            className: 'preview-empty',
            textContent: `${contents.length - 100} more items are included in this plan.`
          }));
        }
      }
      this.refs.progress.max = Math.max(1, contents.length);
      this.refs.progress.value = 0;
      this.refs.exportBackup.disabled = contents.length === 0;
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

