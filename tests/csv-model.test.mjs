import test from 'node:test';
import assert from 'node:assert/strict';
import { loadToolbox } from './load-toolbox.mjs';

const { Core, Reddit } = loadToolbox();

test('parseCsv handles quoted commas and line breaks', () => {
  const rows = Core.parseCsv('id,body\nabc,"hello, world"\ndef,"two\nlines"\n');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].body, 'hello, world');
  assert.equal(rows[1].body, 'two\nlines');
});

test('archive comments receive a t1 fullname', () => {
  const item = Reddit.archiveRowToItem({
    id: 'abc123',
    date: '2023-03-04T10:00:00Z',
    body: 'hello',
    permalink: '/r/test/comments/post/title/abc123/'
  }, 'comments.csv');
  assert.equal(item.fullname, 't1_abc123');
  assert.equal(item.kind, 'comment');
  assert.equal(item.subreddit, 'test');
  assert.equal(item.editable, true);
});

test('archive link posts are marked uneditable', () => {
  const item = Reddit.archiveRowToItem({
    id: 'post42',
    date: '2023-03-04T10:00:00Z',
    title: 'A link',
    permalink: '/r/test/comments/post42/a_link/'
  }, 'posts.csv');
  assert.equal(item.fullname, 't3_post42');
  assert.equal(item.kind, 'post');
  assert.equal(item.editable, false);
});

test('profile data wins when archive and profile items merge', () => {
  const archive = { fullname: 't3_x', kind: 'post', createdAt: 1, subreddit: 'old', text: '', editable: false, source: 'archive' };
  const profile = { fullname: 't3_x', kind: 'post', createdAt: 1, subreddit: 'new', text: 'body', editable: true, source: 'profile' };
  const [merged] = Reddit.mergeItems(archive, profile);
  assert.equal(merged.subreddit, 'new');
  assert.equal(merged.editable, true);
  assert.equal(merged.source, 'profile+archive');
});

test('listing children normalize comments and posts', () => {
  const comment = Reddit.listingChildToItem({ kind: 't1', data: {
    id: 'c1', created_utc: 1_700_000_000, subreddit: 'x', body: 'text', permalink: '/r/x/comments/p/t/c1/'
  }});
  const post = Reddit.listingChildToItem({ kind: 't3', data: {
    name: 't3_p1', created_utc: 1_700_000_001, subreddit: 'x', title: 'post', is_self: false
  }});
  assert.equal(comment.fullname, 't1_c1');
  assert.equal(comment.editable, true);
  assert.equal(post.editable, false);
});


test('normalizeFullname rejects mismatched prefixes and loose text', () => {
  assert.equal(Reddit.normalizeFullname('abc123', 'comment'), 't1_abc123');
  assert.equal(Reddit.normalizeFullname('t3_abc123', 'comment'), '');
  assert.equal(Reddit.normalizeFullname('https://reddit.com/comments/abc', 'post'), '');
});
