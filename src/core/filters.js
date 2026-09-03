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
