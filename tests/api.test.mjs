import test from 'node:test';
import assert from 'node:assert/strict';
import { loadToolbox } from './load-toolbox.mjs';

const { Core, Reddit } = loadToolbox();

function jsonResponse(payload, options = {}) {
  return new Response(JSON.stringify(payload), {
    status: options.status || 200,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) }
  });
}

test('getSession reads username and modhash without storing credentials', async () => {
  const client = new Reddit.RedditSessionClient({
    origin: 'https://www.reddit.com',
    fetchImpl: async () => jsonResponse({ data: { name: 'sam', modhash: 'abc' } })
  });
  const session = await client.getSession();
  assert.deepEqual({ ...session }, { username: 'sam', modhash: 'abc' });
});


test('getSession can scan without a modhash but requires one for actions', async () => {
  const client = new Reddit.RedditSessionClient({
    origin: 'https://www.reddit.com',
    fetchImpl: async () => jsonResponse({ data: { name: 'sam', modhash: '' } })
  });
  const session = await client.getSession();
  assert.deepEqual({ ...session }, { username: 'sam', modhash: '' });
  await assert.rejects(client.getSession(true), (error) => error.code === 'MODHASH_MISSING');
});

test('listUserContent paginates with after and normalizes children', async () => {
  const requests = [];
  const client = new Reddit.RedditSessionClient({
    origin: 'https://www.reddit.com',
    username: 'sam',
    modhash: 'abc',
    fetchImpl: async (url) => {
      requests.push(String(url));
      return jsonResponse({ data: {
        after: 't1_next',
        children: [{ kind: 't1', data: {
          name: 't1_c1', created_utc: 1_700_000_000, subreddit: 'test', body: 'hello'
        }}]
      }});
    }
  });
  const page = await client.listUserContent('comment', { after: 't1_prev', count: 100 });
  assert.equal(page.after, 't1_next');
  assert.equal(page.items[0].fullname, 't1_c1');
  assert.match(requests[0], /after=t1_prev/);
  assert.match(requests[0], /count=100/);
});

test('edit and delete send documented fullname fields and modhash', async () => {
  const requests = [];
  const client = new Reddit.RedditSessionClient({
    origin: 'https://www.reddit.com',
    username: 'sam',
    modhash: 'test-modhash',
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      return new Response('', { status: 200 });
    }
  });
  await client.edit('t1_c1', 'letters');
  await client.delete('t1_c1');
  assert.equal(new URL(requests[0].url).pathname, '/api/editusertext');
  assert.equal(requests[0].options.body.get('thing_id'), 't1_c1');
  assert.equal(requests[0].options.body.get('text'), 'letters');
  assert.equal(requests[0].options.headers['X-Modhash'], 'test-modhash');
  assert.equal(new URL(requests[1].url).pathname, '/api/del');
  assert.equal(requests[1].options.body.get('id'), 't1_c1');
});

test('verifyText reads comment or self-post text', async () => {
  const client = new Reddit.RedditSessionClient({
    origin: 'https://www.reddit.com',
    username: 'sam',
    modhash: 'test-modhash',
    fetchImpl: async () => jsonResponse({ data: { children: [{ kind: 't1', data: { name: 't1_c1', body: 'letters', author: 'sam' } }] } })
  });
  assert.equal(await client.verifyText('t1_c1', 'letters'), true);
  assert.equal(await client.verifyText('t1_c1', 'different'), false);
});

test('HTTP 429 becomes a RateLimitError with Retry-After', async () => {
  const client = new Reddit.RedditSessionClient({
    origin: 'https://www.reddit.com',
    fetchImpl: async () => jsonResponse({}, { status: 429, headers: { 'retry-after': '2' } })
  });
  await assert.rejects(client.getJson('/api/me.json'), (error) => {
    assert.equal(error instanceof Core.RateLimitError, true);
    assert.equal(error.retryAfterMs, 2000);
    return true;
  });
});

test('API error arrays are surfaced and do not look successful', async () => {
  const client = new Reddit.RedditSessionClient({
    origin: 'https://www.reddit.com',
    username: 'sam',
    modhash: 'test-modhash',
    fetchImpl: async () => jsonResponse({ json: { errors: [['BAD_ID', 'Not editable', 'thing_id']] } })
  });
  await assert.rejects(client.edit('t3_x', 'letters'), (error) => error.code === 'BAD_ID');
});

test('client refuses non-Reddit request origins', () => {
  const client = new Reddit.RedditSessionClient({
    origin: 'https://example.com',
    fetchImpl: async () => jsonResponse({})
  });
  assert.throws(() => client.url('/api/me.json'), /only sends requests/i);
});


test('ownership and deletion checks bind to the exact fullname', async () => {
  const responses = [
    { kind: 't1', data: { name: 't1_c1', author: 'sam', body: 'hello' } },
    { kind: 't1', data: { name: 't1_c1', author: '[deleted]', body: '[deleted]' } }
  ];
  const client = new Reddit.RedditSessionClient({
    origin: 'https://www.reddit.com',
    username: 'sam',
    modhash: 'test-modhash',
    fetchImpl: async () => jsonResponse({ data: { children: [responses.shift()] } })
  });
  assert.equal(await client.verifyOwnership('t1_c1'), true);
  assert.equal(await client.isDeleted('t1_c1'), true);
});
