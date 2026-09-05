import test from 'node:test';
import assert from 'node:assert/strict';
import { loadToolbox } from './load-toolbox.mjs';
import { virtualPacer } from './virtual-pacer.mjs';

const { Reddit } = loadToolbox();
const response = (payload = {}, headers = {}, status = 200) => new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json', ...headers } });

test('all transport reads and writes share eight requests per minute with no bursts', async () => {
  const pacer = virtualPacer(Reddit);
  const sent = [];
  const client = new Reddit.RedditSessionClient({ pacer, modhash: 'fixture', fetchImpl: async (url, init) => {
    sent.push({ at: pacer.now(), path: new URL(url).pathname, method: init.method });
    return response();
  } });
  await Promise.all([
    client.getJson('/api/me.json'), client.getJson('/user/fixture/comments.json'),
    client.edit('t1_a', 'replacement'), client.getJson('/api/info.json'), client.delete('t1_a'),
    ...Array.from({ length: 8 }, () => client.getJson('/api/info.json'))
  ]);
  assert.equal(sent.length, 13);
  for (let i = 1; i < sent.length; i++) assert.ok(sent[i].at - sent[i - 1].at >= 7_500);
  for (const row of sent) assert.ok(sent.filter(other => other.at >= row.at && other.at < row.at + 60_000).length <= 8);
  assert.equal(sent.filter(row => row.method === 'POST').length, 2);
});

test('tabs and reloads share admission slots and cooldowns under one exclusive request lock', async () => {
  let now = 0;
  const values = new Map();
  let queue = Promise.resolve();
  const locks = { request: (name, options, operation) => {
    assert.equal(name, 'reddit-toolbox-requests');
    assert.equal(options.mode, 'exclusive');
    const pending = queue.then(operation); queue = pending.catch(() => {}); return pending;
  } };
  const options = { now: () => now, sleep: async ms => { now += ms; }, lockManager: locks,
    store: { get: key => values.get(key), set: (key, value) => values.set(key, value) } };
  const a = new Reddit.RequestPacer(options), b = new Reddit.RequestPacer(options);
  const sent = [];
  await Promise.all([a.run(() => { sent.push(now); a.defer(45_000); }), b.run(() => sent.push(now))]);
  await new Reddit.RequestPacer(options).run(() => sent.push(now));
  assert.deepEqual(sent, [0, 45_000, 52_500]);
  assert.deepEqual(Object.keys(values.get('request-budget')).sort(), ['cooldownUntil', 'nextRequestAt']);
});

test('remaining allowance slows requests before the limit is reached', async () => {
  const pacer = virtualPacer(Reddit);
  await pacer.run(() => pacer.observe(response({}, { 'x-ratelimit-remaining': '10', 'x-ratelimit-reset': '120' })));
  let sent;
  await pacer.run(() => { sent = pacer.now(); });
  assert.ok(sent >= 15_000, 'Spread remaining allowance across the reset window with headroom');
});

test('zero, fractional last request, and negative allowances wait through reset without a probe', async () => {
  for (const remaining of ['0', '1.9', '-1']) {
    const pacer = virtualPacer(Reddit);
    let sent = 0;
    await pacer.run(() => { sent++; pacer.observe(response({}, { 'x-ratelimit-remaining': remaining, 'x-ratelimit-reset': '60' })); });
    await pacer.run(() => { assert.ok(pacer.now() >= 61_000); sent++; });
    assert.equal(sent, 2);
  }
});

test('missing and malformed rate headers never disable the fixed ceiling', async () => {
  for (const headers of [{}, { 'x-ratelimit-remaining': '', 'x-ratelimit-reset': '600' }, { 'x-ratelimit-remaining': 'abc', 'x-ratelimit-reset': '600' }, { 'x-ratelimit-remaining': '100', 'x-ratelimit-reset': '-1' }]) {
    const pacer = virtualPacer(Reddit);
    await pacer.run(() => pacer.observe(response({}, headers)));
    await pacer.run(() => assert.equal(pacer.now(), 7_500));
  }
});

test('HTTP and JSON rate-limit rejections persist a cooldown for every later request', async () => {
  for (const rejection of [response({}, { 'retry-after': '30' }, 429), response({ error: 429 }, { 'retry-after': '30' }), response({ json: { errors: [['RATELIMIT', 'Try again in 30 seconds', '']] } })]) {
    const pacer = virtualPacer(Reddit);
    let calls = 0;
    const client = new Reddit.RedditSessionClient({ pacer, fetchImpl: async () => ++calls === 1 ? rejection : response() });
    await assert.rejects(client.getJson('/api/me.json'), { code: 'RATE_LIMITED' });
    await client.getJson('/api/me.json');
    assert.equal(calls, 2);
    assert.ok(pacer.now() >= 30_000);
  }
});

test('a lost transport response consumes its slot and does not poison the next queued request', async () => {
  const pacer = virtualPacer(Reddit);
  let calls = 0;
  const client = new Reddit.RedditSessionClient({ pacer, fetchImpl: async () => {
    if (++calls === 1) throw new Error('Synthetic lost response');
    assert.equal(pacer.now(), 7_500); return response();
  } });
  const results = await Promise.allSettled([client.getJson('/api/me.json'), client.getJson('/api/info.json')]);
  assert.equal(results[0].reason.code, 'NETWORK_ERROR');
  assert.equal(results[1].status, 'fulfilled');
  assert.equal(calls, 2);
});

test('waiting requests honor cancellation before sending and clear their countdown', async () => {
  const pacer = virtualPacer(Reddit);
  await pacer.run(() => {});
  let checks = 0, sent = false;
  const waits = [];
  await assert.rejects(pacer.run(() => { sent = true; }, {
    checkpoint: () => { if (++checks === 3) throw new Error('Cancelled'); },
    onWait: event => waits.push(event.remainingMs)
  }), /Cancelled/);
  assert.equal(sent, false);
  assert.equal(waits.at(-1), 0);
  assert.ok(waits[0] > 0);
  await pacer.run(() => assert.equal(pacer.now(), 7_500));
});

test('the network timeout begins after admission, not while waiting for allowance', async () => {
  const pacer = virtualPacer(Reddit, { sleep: async () => {} });
  pacer.run = async operation => { await new Promise(resolve => setTimeout(resolve, 150)); return operation(); };
  const client = new Reddit.RedditSessionClient({ pacer, requestTimeoutMs: 100, fetchImpl: async (_url, { signal }) => {
    assert.equal(signal.aborted, false); return response();
  } });
  await client.getJson('/api/me.json');
});
