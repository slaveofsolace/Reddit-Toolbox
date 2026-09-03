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
