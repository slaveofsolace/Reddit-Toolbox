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
