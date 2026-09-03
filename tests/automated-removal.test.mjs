import test from 'node:test';
import assert from 'node:assert/strict';
import { loadToolbox } from './load-toolbox.mjs';

function response(payload, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => name.toLowerCase() === 'content-type' ? 'application/json' : null },
    async text() { return JSON.stringify(payload); }
  };
}

test('assertSession pauses when the signed-in Reddit account changes', async () => {
  const { Reddit } = loadToolbox({
    files: [
      'src/core/namespace.js',
      'src/core/errors.js',
      'src/reddit/api.js'
    ]
  });
  const client = new Reddit.RedditSessionClient({
    origin: 'https://www.reddit.com',
    fetchImpl: async () => response({ data: { name: 'other-account', modhash: 'fresh' } })
  });

  await assert.rejects(client.assertSession('sam', true), (error) => {
    assert.equal(error.code, 'ACCOUNT_CHANGED');
    assert.equal(error.pauseRequired, true);
    return true;
  });
});

test('automated removal revalidates the account before mutation', async () => {
  const { Core, Reddit } = loadToolbox({
    files: [
      'src/core/namespace.js',
      'src/core/errors.js',
      'src/core/random.js',
      'src/core/runner.js',
      'src/reddit/removal-service.js'
    ]
  });
  let edited = false;
  let deleted = false;
  const service = new Reddit.RedditRemovalService({
    async assertSession() {
      throw new Core.PauseRequiredError('account changed', { code: 'ACCOUNT_CHANGED' });
    },
    async verifyOwnership() { return true; },
    async edit() { edited = true; },
    async delete() { deleted = true; }
  }, {
    expectedUsername: 'sam',
    sleep: async () => {}
  });

  await assert.rejects(
    service.remove({ fullname: 't1_a', kind: 'comment', editable: true }),
    (error) => error.code === 'ACCOUNT_CHANGED'
  );
  assert.equal(edited, false);
  assert.equal(deleted, false);
});

test('phase events expose the full automatic overwrite-delete lifecycle', async () => {
  const { Reddit } = loadToolbox({
    files: [
      'src/core/namespace.js',
      'src/core/errors.js',
      'src/core/random.js',
      'src/core/runner.js',
      'src/reddit/removal-service.js'
    ]
  });
  const phases = [];
  const client = {
    async assertSession() { return { username: 'sam', modhash: 'fresh' }; },
    async verifyOwnership() { return true; },
    async edit() {},
    async verifyText() { return true; },
    async delete() {},
    async isDeleted() { return true; }
  };
  const service = new Reddit.RedditRemovalService(client, {
    expectedUsername: 'sam',
    replacementLength: 8,
    minimumSettleMs: 250,
    maximumSettleMs: 250,
    sleep: async () => {},
    randomSource: { getRandomValues(buffer) { buffer[0] = 0; return buffer; } }
  });

  const result = await service.remove(
    { fullname: 't1_a', kind: 'comment', editable: true },
    { reportPhase: (phase) => phases.push(phase) }
  );

  assert.equal(result.deleted, true);
  assert.deepEqual(phases, [
    'checking-session',
    'checking-ownership',
    'preparing-replacement',
    'checking-session',
    'overwriting',
    'waiting-for-save',
    'verifying-overwrite',
    'checking-session',
    'deleting',
    'verifying-deletion',
    'complete'
  ]);
});
