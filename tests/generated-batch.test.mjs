import test from 'node:test';
import assert from 'node:assert/strict';
import { loadToolbox } from './load-toolbox.mjs';

// Exercise the distributable, including its source order and UI composition.
const load = (globals) => loadToolbox({ files: ['userscripts/reddit-toolbox.user.js'], globals });
const item = (id, kind = 'comment', editable = true) => ({ fullname: `${kind === 'comment' ? 't1' : 't3'}_${id}`, kind, editable, createdAt: 1700000000000 });
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function fixture(items = [item('a'), item('b')], options = {}) {
  const { Core, Reddit } = load();
  const calls = [];
  const texts = new Map();
  const deleted = new Set();
  let account = 'fixture-owner';
  const client = {
    async assertSession(expected) {
      calls.push(['account']);
      if (account !== expected) throw new Core.PauseRequiredError('Account changed.', { code: 'ACCOUNT_CHANGED' });
      return { username: account };
    },
    async inspectTarget(id) { return { available: true, owned: true, editable: items.find((row) => row.fullname === id).editable }; },
    async edit(id, text) { calls.push(['edit', id, text]); texts.set(id, text); },
    async verifyText(id, text) { calls.push(['verify', id]); return texts.get(id) === text; },
    async delete(id) { calls.push(['delete', id]); deleted.add(id); },
    async isDeleted(id) { calls.push(['deleted', id]); return deleted.has(id); }
  };
  const plan = Core.createPlan(items, { accountId: account, deleteUneditablePosts: options.direct === true });
  const service = new Reddit.RedditRemovalService(client, { ...plan.options, expectedUsername: account, sleep: async () => {} });
  const runner = new Core.BatchRunner((row, context) => service.remove(row, context), {
    minimumDelayMs: 0, maximumDelayMs: 0, sleep: async () => {}, ...options.runner
  });
  return { Core, Reddit, client, service, plan, runner, calls, texts, deleted, setAccount: (value) => { account = value; } };
}

test('generated script automatically completes two comments and a mixed direct-delete queue', async () => {
  for (const rows of [[item('a'), item('b')], [item('a'), item('b', 'post'), item('c', 'post', false)]]) {
    const f = fixture(rows, { direct: true });
    const result = await f.runner.run(f.plan);
    assert.equal(result.completed, rows.length);
    assert.deepEqual(f.calls.filter(([op]) => ['edit', 'delete'].includes(op)).map(([op, id]) => `${op}:${id}`), rows.flatMap((row) => row.editable ? [`edit:${row.fullname}`, `delete:${row.fullname}`] : [`delete:${row.fullname}`]));
    assert.ok(f.calls.filter(([op]) => op === 'edit').every(([, , text]) => /^[a-z]{24}$/.test(text)));
  }
});

test('account changes between items or between overwrite and deletion prevent the next mutation', async () => {
  for (const boundary of ['item', 'edit']) {
    const f = fixture();
    const edit = f.client.edit;
    if (boundary === 'edit') f.client.edit = async (...args) => { await edit(...args); f.setAccount('changed-account'); };
    f.runner.onEvent = (event) => {
      if (boundary === 'item' && event.type === 'item-finished') f.setAccount('changed-account');
      if (event.type === 'attention-required') f.runner.stop();
    };
    await f.runner.run(f.plan);
    assert.equal(f.calls.filter(([op]) => op === 'edit').length, 1);
    assert.equal(f.calls.filter(([op]) => op === 'delete').length, boundary === 'item' ? 1 : 0);
  }
});

test('pause settles overwrite verification and waits before delete; resume revalidates the account', async () => {
  const f = fixture();
  let verified = false;
  f.runner.onEvent = (event) => {
    if (event.type === 'item-phase' && event.index === 0 && event.phase === 'waiting-for-save') f.runner.pause();
    if (event.type === 'item-phase' && event.phase === 'verifying-overwrite') verified = true;
  };
  const running = f.runner.run(f.plan);
  await tick();
  assert.equal(verified, true);
  assert.equal(f.runner.state, 'paused');
  assert.equal(f.deleted.size, 0);
  f.runner.resume();
  await running;
  assert.equal(f.deleted.size, 2);
});

test('Stop waits for an in-flight delete to settle and includes only untouched items in retry', async () => {
  const f = fixture();
  let settle;
  const original = f.client.delete;
  f.client.delete = async (...args) => { await new Promise((resolve) => { settle = resolve; }); await original(...args); };
  const running = f.runner.run(f.plan);
  await tick();
  f.runner.stop();
  assert.equal(f.runner.state, 'stopping');
  assert.equal(f.deleted.size, 0);
  settle();
  const result = await running;
  assert.equal(result.completed, 1);
  assert.equal(result.stopped, 1);
  const retry = f.Core.createRetryPlan(f.plan);
  assert.deepEqual(Array.from(retry.items, (row) => row.content.fullname), ['t1_b']);
  assert.equal(retry.options.accountId, f.plan.options.accountId);
});

test('a lost edit response is read back using the same replacement and never blindly resent', async () => {
  for (const saved of [false, true]) {
    const f = fixture([item('a')]);
    const original = f.client.edit;
    let edits = 0;
    f.client.edit = async (...args) => { edits += 1; if (saved) await original(...args); throw new f.Core.ApiError('Lost response.', { code: 'NETWORK_ERROR', retryable: true }); };
    if (saved) assert.equal((await f.service.remove(item('a'))).deleted, true);
    else {
      await assert.rejects(f.service.remove(item('a')), { code: 'OVERWRITE_RESULT_UNCERTAIN' });
      await assert.rejects(f.service.remove(item('a')), { code: 'OVERWRITE_RESULT_UNCERTAIN' });
      assert.equal(f.deleted.size, 0);
    }
    assert.equal(edits, 1);
  }
});

test('unresolved deletion remains single-send across fresh reviews on the same page', async () => {
  const f = fixture([item('a')]);
  let deletes = 0;
  f.client.delete = async () => { deletes += 1; throw new TypeError('Response body interrupted.'); };
  await assert.rejects(f.service.remove(item('a')), { code: 'DELETE_RESULT_UNCERTAIN' });
  await assert.rejects(f.service.remove(item('a')), { code: 'DELETE_RESULT_UNCERTAIN' });
  assert.equal(deletes, 1);
});

test('429 waits automatically while isolated failures advance and five failures pause', async () => {
  const f = fixture([item('a'), item('b')]);
  const edit = f.client.edit;
  let calls = 0;
  const sleeps = [];
  f.runner.sleep = async (ms) => sleeps.push(ms);
  f.client.edit = async (...args) => { if (++calls === 1) throw new f.Core.RateLimitError('Wait.', 65000); await edit(...args); };
  assert.equal((await f.runner.run(f.plan)).completed, 2);
  assert.equal(sleeps.reduce((sum, value) => sum + value, 0), 65000);
  const g = fixture(Array.from({ length: 7 }, (_, i) => item(String(i))));
  g.client.inspectTarget = async () => ({ available: true, owned: false });
  g.runner.onEvent = (event) => { if (event.type === 'failure-guard') g.runner.stop(); };
  const summary = await g.runner.run(g.plan);
  assert.equal(summary.failed, 5);
  assert.equal(summary.stopped, 2);
  assert.equal(g.calls.some(([op]) => op === 'edit'), false);
});

test('review binds account and source snapshots, and cannot be reconstructed after reload', () => {
  const { Core } = load();
  const row = item('a');
  const plan = Core.createPlan([row], { accountId: 'fixture-owner' });
  row.fullname = 't1_other';
  assert.equal(plan.items[0].content.fullname, 't1_a');
  const rebuilt = JSON.parse(JSON.stringify(plan));
  assert.equal(Core.isPlanCurrent(rebuilt), false);
  plan.options.accountId = 'changed-account';
  assert.equal(Core.isPlanCurrent(plan), false);
});

test('missing cross-tab locking and missing secure randomness fail closed', async () => {
  const { Core } = load({ navigator: {}, crypto: {} });
  let calls = 0;
  const runner = new Core.BatchRunner(async () => { calls += 1; });
  await assert.rejects(runner.run(Core.createPlan([item('a')])), /cross-tab lock/);
  assert.equal(calls, 0);
  assert.throws(() => Core.randomLetterString(), /Secure random/);
});

test('deletion verification rejects missing listings, wrong targets and moderation removal', async () => {
  const { Reddit } = load();
  let payload;
  const client = new Reddit.RedditSessionClient({ origin: 'https://www.reddit.com', fetchImpl: async () => ({ status: 200, ok: true, headers: { get: () => 'application/json' }, text: async () => JSON.stringify(payload) }) });
  payload = { data: { children: [] } };
  assert.equal(await client.isDeleted('t1_a'), false);
  payload = {};
  await assert.rejects(client.isDeleted('t1_a'), { code: 'INVALID_LISTING' });
  payload = { data: { children: [{ kind: 't1', data: { name: 't1_b', author: '[deleted]', body: '[deleted]' } }] } };
  await assert.rejects(client.isDeleted('t1_a'), { code: 'TARGET_MISMATCH' });
  payload.data.children[0].data.name = 't1_a';
  payload.data.children[0].data.body = '[removed]';
  assert.equal(await client.isDeleted('t1_a'), false);
});

test('transport preserves HTTP attention and Retry-After even when the response body is broken', async () => {
  const { Reddit } = load();
  for (const [status, code] of [[401, 'AUTH_REQUIRED'], [403, 'REDDIT_FORBIDDEN'], [429, 'RATE_LIMITED'], [200, 'RESPONSE_LOST']]) {
    const client = new Reddit.RedditSessionClient({ origin: 'https://www.reddit.com', modhash: 'fixture-only', fetchImpl: async () => ({ status, ok: status === 200, headers: { get: (key) => key === 'retry-after' ? '90' : 'application/json' }, text: async () => { throw new TypeError('Lost body'); } }) });
    await assert.rejects(client.delete('t1_a'), (error) => error.code === code && (status !== 429 || error.retryAfterMs === 90000));
  }
});

test('50,000-row local archives yield to the UI and report invalid and duplicate rows', async () => {
  const { Reddit } = load();
  const rows = Array.from({ length: 50000 }, (_, i) => `${i.toString(36)},1700000000,fixture text`);
  let yields = 0;
  const result = await Reddit.importArchiveCsvAsync(`id,created_utc,body\n${rows.join('\n')}\n0,1700000000,duplicate\nbad id,1700000000,invalid`, 'comments.csv', { yieldTask: async () => { yields += 1; } });
  assert.equal(result.items.length, 50000);
  assert.equal(result.duplicates, 1);
  assert.equal(result.rejected, 1);
  assert.ok(yields > 20);
  await assert.rejects(Reddit.importArchiveCsvAsync('url,date\nhttps://example.com,2026-01-01', 'comments.csv'), /ID and date/);
});

test('eventual consistency is read repeatedly without another mutation', async () => {
  const f = fixture([item('a')]);
  let textReads = 0;
  let deletionReads = 0;
  const verifyText = f.client.verifyText;
  f.client.verifyText = async (...args) => ++textReads < 3 ? false : verifyText(...args);
  f.client.isDeleted = async () => ++deletionReads >= 3;
  assert.equal((await f.runner.run(f.plan)).completed, 1);
  assert.equal(f.calls.filter(([op]) => op === 'edit').length, 1);
  assert.equal(f.calls.filter(([op]) => op === 'delete').length, 1);
});

test('pause and stop during a long rate-limit wait do not start the next item', async () => {
  const f = fixture();
  f.client.edit = async () => { throw new f.Core.RateLimitError('Wait.', 120000); };
  f.runner.onEvent = (event) => { if (event.type === 'wait-tick') f.runner.pause(); };
  const running = f.runner.run(f.plan);
  await tick();
  assert.equal(f.runner.state, 'paused');
  f.runner.stop();
  const result = await running;
  assert.equal(result.stopped, 2);
  assert.equal(f.deleted.size, 0);
});

test('requests have a bounded timeout and reject noncanonical destructive origins', async () => {
  const { Reddit } = load();
  const client = new Reddit.RedditSessionClient({ requestTimeoutMs: 100, fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Timed out')))) });
  await assert.rejects(client.getSession(), { code: 'NETWORK_ERROR' });
  for (const origin of ['https://old.reddit.com', 'https://new.reddit.com', 'https://sh.reddit.com']) {
    client.origin = origin;
    await assert.rejects(client.delete('t1_a'), { code: 'CANONICAL_ORIGIN_REQUIRED' });
  }
});

test('the production UI uses the existing login without OAuth or a client ID', async () => {
  let calls = 0;
  const { UI, Reddit } = load({ fetch: async () => { calls += 1; return { ok: true, status: 200, headers: { get: () => 'application/json' }, text: async () => JSON.stringify({ data: { name: 'fixture-owner', modhash: 'fixture-action' } }) }; } });
  const app = new UI.RedditToolboxApp({ store: { get: (_name, fallback) => fallback } });
  assert.ok(app.ensureClient() instanceof Reddit.RedditSessionClient);
  assert.equal(calls, 0);
  assert.equal((await app.ensureClient().getSession()).username, 'fixture-owner');
  assert.equal(calls, 1);
  assert.equal(Reddit.RedditOAuthClient, undefined);
});
