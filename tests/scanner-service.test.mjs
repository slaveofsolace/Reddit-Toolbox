import test from 'node:test';
import assert from 'node:assert/strict';
import { loadToolbox } from './load-toolbox.mjs';

const { Core, Reddit } = loadToolbox();

test('RedditScanner follows listing cursors and reports truncation', async () => {
  let calls = 0;
  const client = {
    username: 'sam',
    async getSession() { return { username: 'sam' }; },
    async listUserContent() {
      calls += 1;
      return {
        items: [{ fullname: `t1_${calls}`, kind: 'comment', createdAt: calls, source: 'profile' }],
        after: calls < 3 ? `t1_${calls}` : null
      };
    }
  };
  const scanner = new Reddit.RedditScanner(client, {
    maxPagesPerType: 2,
    pageDelayMs: 0,
    sleep: async () => {}
  });
  const result = await scanner.scanProfile({ includePosts: false });
  assert.equal(result.items.length, 2);
  assert.equal(result.report.comments.truncated, true);
});


test('RedditScanner stops when Reddit repeats a listing cursor', async () => {
  let calls = 0;
  const client = {
    username: 'sam',
    async getSession() { return { username: 'sam' }; },
    async listUserContent() {
      calls += 1;
      return {
        items: [{ fullname: `t1_loop${calls}`, kind: 'comment', createdAt: calls, source: 'profile' }],
        after: 't1_same'
      };
    }
  };
  const scanner = new Reddit.RedditScanner(client, {
    maxPagesPerType: 25,
    pageDelayMs: 0,
    sleep: async () => {}
  });
  const result = await scanner.scanProfile({ includePosts: false });
  assert.equal(calls, 2);
  assert.equal(result.report.comments.cursorLoop, true);
  assert.equal(result.report.comments.truncated, true);
});

test('archive import parses Reddit CSV rows', () => {
  const result = Reddit.importArchiveCsv(
    'id,date,body,permalink\nabc,2024-01-01,hello,/r/x/comments/p/t/abc/\n',
    'comments.csv'
  );
  assert.equal(result.rowCount, 1);
  assert.equal(result.items[0].fullname, 't1_abc');
});

test('removal service edits, verifies, then deletes', async () => {
  const calls = [];
  const client = {
    async verifyOwnership(id) { calls.push(['owner', id]); return true; },
    async edit(id, text) { calls.push(['edit', id, text]); },
    async verifyText(id, text) { calls.push(['verify', id, text]); return true; },
    async delete(id) { calls.push(['delete', id]); },
    async isDeleted(id) { calls.push(['deleted', id]); return true; }
  };
  const randomSource = { getRandomValues(buffer) { buffer[0] = 0; return buffer; } };
  const service = new Reddit.RedditRemovalService(client, {
    replacementLength: 8,
    minimumSettleMs: 250,
    maximumSettleMs: 250,
    sleep: async (ms) => calls.push(['sleep', ms]),
    randomSource
  });
  const result = await service.remove({ fullname: 't1_a', kind: 'comment', editable: true });
  assert.equal(result.deleted, true);
  assert.deepEqual(calls.map((entry) => entry[0]), ['owner', 'owner', 'edit', 'sleep', 'verify', 'owner', 'verify', 'delete', 'deleted']);
  assert.equal(calls.find((entry) => entry[0] === 'edit')[2], 'aaaaaaaa');
});

test('uneditable posts are skipped unless direct deletion is enabled', async () => {
  let deleted = false;
  const client = {
    async verifyOwnership() { return true; },
    async delete() { deleted = true; },
    async isDeleted() { return true; }
  };
  const skippedService = new Reddit.RedditRemovalService(client, { deleteUneditablePosts: false });
  const skipped = await skippedService.remove({ fullname: 't3_a', kind: 'post', editable: false });
  assert.equal(skipped.status, 'skipped');
  assert.equal(deleted, false);

  const deleteService = new Reddit.RedditRemovalService(client, { deleteUneditablePosts: true });
  const completed = await deleteService.remove({ fullname: 't3_a', kind: 'post', editable: false });
  assert.equal(completed.deleted, true);
  assert.equal(completed.overwritten, false);
});

test('failed overwrite verification prevents deletion', async () => {
  let deleted = false;
  const client = {
    async verifyOwnership() { return true; },
    async edit() {},
    async verifyText() { return false; },
    async delete() { deleted = true; },
    async isDeleted() { return false; }
  };
  const service = new Reddit.RedditRemovalService(client, {
    sleep: async () => {},
    randomSource: { getRandomValues(buffer) { buffer[0] = 1; return buffer; } }
  });
  await assert.rejects(
    service.remove({ fullname: 't1_a', kind: 'comment', editable: true }),
    (error) => error.code === 'OVERWRITE_NOT_VERIFIED'
  );
  assert.equal(deleted, false);
});


test('ownership must be verified before any mutation', async () => {
  let edited = false;
  let deleted = false;
  const service = new Reddit.RedditRemovalService({
    async verifyOwnership() { return false; },
    async edit() { edited = true; },
    async delete() { deleted = true; }
  }, { sleep: async () => {} });

  await assert.rejects(
    service.remove({ fullname: 't1_a', kind: 'comment', editable: true }),
    (error) => error.code === 'OWNERSHIP_NOT_VERIFIED'
  );
  assert.equal(edited, false);
  assert.equal(deleted, false);
});

test('an uncertain delete is never sent twice automatically', async () => {
  let deleteCalls = 0;
  let deleted = false;
  const client = {
    async verifyOwnership() { return true; },
    async edit() {},
    async verifyText() { return true; },
    async delete() {
      deleteCalls += 1;
      throw new Core.ApiError('connection lost', { code: 'NETWORK_ERROR', retryable: true });
    },
    async isDeleted() { return deleted; }
  };
  const service = new Reddit.RedditRemovalService(client, {
    sleep: async () => {},
    verificationAttempts: 1
  });
  const item = { fullname: 't1_a', kind: 'comment', editable: true };

  await assert.rejects(service.remove(item), (error) => error.code === 'DELETE_RESULT_UNCERTAIN');
  deleted = true;
  const result = await service.remove(item);
  assert.equal(result.deleted, true);
  assert.equal(deleteCalls, 1);
});

test('an ambiguous edit result is verified before any resend', async () => {
  let editCalls = 0;
  let deleteCalls = 0;
  const replacements = [];
  const client = {
    async verifyOwnership() { return true; },
    async edit(_id, text) {
      editCalls += 1;
      replacements.push(text);
      throw new Core.ApiError('connection lost', { code: 'NETWORK_ERROR', retryable: true });
    },
    async verifyText(_id, text) { return text === replacements[0]; },
    async delete() { deleteCalls += 1; },
    async isDeleted() { return true; }
  };
  const service = new Reddit.RedditRemovalService(client, {
    sleep: async () => {},
    verificationAttempts: 1,
    randomSource: { getRandomValues(buffer) { buffer[0] = 2; return buffer; } }
  });

  const result = await service.remove({ fullname: 't1_edit', kind: 'comment', editable: true });
  assert.equal(result.deleted, true);
  assert.equal(editCalls, 1);
  assert.equal(deleteCalls, 1);
  assert.equal(replacements[0], 'cccccccccccccccccccccccc');
});

test('an ambiguous HTTP 5xx delete is never sent twice automatically', async () => {
  let deleteCalls = 0;
  let deleted = false;
  const client = {
    async verifyOwnership() { return true; },
    async edit() {},
    async verifyText() { return true; },
    async delete() {
      deleteCalls += 1;
      throw new Core.ApiError('server failure', { code: 'HTTP_503', status: 503, retryable: true });
    },
    async isDeleted() { return deleted; }
  };
  const service = new Reddit.RedditRemovalService(client, {
    sleep: async () => {},
    verificationAttempts: 1
  });
  const item = { fullname: 't1_5xx', kind: 'comment', editable: true };

  await assert.rejects(service.remove(item), (error) => error.code === 'DELETE_RESULT_UNCERTAIN');
  deleted = true;
  const result = await service.remove(item);
  assert.equal(result.deleted, true);
  assert.equal(deleteCalls, 1);
});
