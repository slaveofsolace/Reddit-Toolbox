import test from 'node:test';
import assert from 'node:assert/strict';
import { loadToolbox } from './load-toolbox.mjs';

const response = (body, status = 200, headers = {}) => ({ ok: status >= 200 && status < 300, status,
  headers: { get: (key) => headers[key.toLowerCase()] ?? (key === 'content-type' ? 'application/json' : null) }, text: async () => JSON.stringify(body) });
const tokens = (extra = {}) => ({ access_token: 'fixture-access', refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 3600, scope: 'identity history read edit', ...extra });

function fixture(options = {}) {
  let now = 1700000000000;
  class Clock extends Date { static now() { return now; } }
  const { Reddit, Core } = loadToolbox({ globals: { Date: Clock, fetch: async () => { throw new Error('Unexpected fetch'); } } });
  const calls = [];
  const waits = [];
  let owner = 'fixture-owner';
  let signedIn = owner;
  let issue = tokens();
  let headers = {};
  const client = new Reddit.RedditOAuthClient({
    authorize: async () => 'one-use-code',
    siteClient: { getSession: async () => ({ username: signedIn }) },
    sleep: async (ms) => { waits.push(ms); now += ms; },
    send: async (url, args) => {
      calls.push({ url, args });
      if (url.endsWith('/access_token')) return response(issue);
      if (url.endsWith('/api/v1/me')) return response({ name: owner }, 200, headers);
      return response({});
    }, ...options
  });
  return { Reddit, Core, client, calls, waits, advance: ms => { now += ms; },
    setIssue: value => { issue = value; }, setOwner: value => { owner = value; }, setSite: value => { signedIn = value; }, setHeaders: value => { headers = value; } };
}

test('installed app authorization stays on Reddit with minimal scopes and an exact redirect', () => {
  const { Reddit } = fixture();
  const url = new URL(Reddit.authorizationUrl('fixture-client', 'state'));
  assert.equal(url.origin, 'https://www.reddit.com');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://www.reddit.com/?reddit-toolbox=oauth-callback');
  assert.equal(url.searchParams.get('scope'), 'identity history read edit');
  assert.equal(url.searchParams.has('client_secret'), false);
  assert.throws(() => Reddit.authorizationUrl('https://wrong.example', 'state'), { code: 'OAUTH_CLIENT_REQUIRED' });
});

test('OAuth connects without a password or client secret and sends bearer actions without modhashes', async () => {
  const f = fixture();
  assert.equal((await f.client.connect('fixture-client')).username, 'fixture-owner');
  await f.client.edit('t1_test', 'abc');
  await f.client.delete('t1_test');
  const exchange = f.calls[0];
  assert.equal(exchange.args.headers.Authorization, `Basic ${btoa('fixture-client:')}`);
  assert.equal(exchange.args.body.get('code'), 'one-use-code');
  assert.equal(exchange.args.body.has('password'), false);
  assert.equal(f.calls[2].url, 'https://oauth.reddit.com/api/editusertext');
  assert.equal(f.calls[2].args.headers.Authorization, 'Bearer fixture-access');
  assert.equal(f.calls[2].args.body.has('uh'), false);
  assert.equal(f.calls[3].url, 'https://oauth.reddit.com/api/del');
  assert.ok(f.waits.every(ms => ms >= 700));
  const serialized = JSON.stringify(f.client);
  assert.ok(!serialized.includes('fixture-access') && !serialized.includes('fixture-refresh'));
  f.client.disconnect();
  await assert.rejects(f.client.delete('t1_test'), { code: 'OAUTH_NOT_CONNECTED' });
});

test('OAuth renews tokens once before expiry and reconnect replaces old refresh tokens', async () => {
  const f = fixture();
  await f.client.connect('fixture-client');
  f.advance(3600_000);
  f.setIssue(tokens({ access_token: 'renewed', refresh_token: undefined }));
  await Promise.all([f.client.getSession(), f.client.getSession()]);
  const refresh = f.calls.filter(c => c.args.body?.get('grant_type') === 'refresh_token');
  assert.equal(refresh.length, 1);
  assert.equal(refresh[0].args.body.get('refresh_token'), 'fixture-refresh');
  await f.client.connect('another-client');
  f.advance(3600_000);
  await assert.rejects(f.client.getSession(), { code: 'OAUTH_EXPIRED' });
});

test('missing scopes, changed signed-in accounts, and reviewed account mismatches block cleanup', async () => {
  const f = fixture();
  f.setIssue(tokens({ scope: 'identity read' }));
  await assert.rejects(f.client.connect('fixture-client'), { code: 'OAUTH_SCOPE_MISSING' });
  f.setIssue(tokens());
  await f.client.connect('fixture-client');
  f.setSite('another-user');
  await assert.rejects(f.client.assertSession('fixture-owner'), { code: 'ACCOUNT_CHANGED' });
  f.setSite('fixture-owner');
  await assert.rejects(f.client.assertSession('different-reviewed-owner'), { code: 'ACCOUNT_CHANGED' });
  assert.equal(f.calls.filter(c => c.url.endsWith('/api/del')).length, 0);
});

test('OAuth restricts hosts, methods and operations before sending credentials', async () => {
  const f = fixture();
  await f.client.connect('fixture-client');
  const before = f.calls.length;
  await assert.rejects(f.client.getJson('https://example.com/api/v1/me'), { code: 'API_DESTINATION' });
  await assert.rejects(f.client.getJson('/api/vote'), { code: 'API_OPERATION' });
  await assert.rejects(f.client.postForm('/api/v1/me', {}), { code: 'API_OPERATION' });
  f.client.origin = 'https://old.reddit.com';
  await assert.rejects(f.client.delete('t1_test'), { code: 'CANONICAL_ORIGIN_REQUIRED' });
  assert.equal(f.calls.length, before);
});

test('rate-limit headers stop the next request with a recoverable cooldown', async () => {
  const f = fixture();
  f.setHeaders({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '65' });
  await f.client.connect('fixture-client');
  await assert.rejects(f.client.delete('t1_test'), { code: 'RATE_LIMITED', retryAfterMs: 66000 });
  assert.equal(f.calls.length, 2);
  f.advance(66000);
  await f.client.delete('t1_test');
});

test('Tampermonkey transport is cookie-free, bounded and refuses redirects', async () => {
  const { Reddit } = fixture();
  let details;
  const transport = (value) => { details = value; value.onload({ status: 200, responseText: '{}', responseHeaders: 'Content-Type: application/json\r\n', finalUrl: value.url }); };
  const result = await Reddit.userscriptRequest('https://oauth.reddit.com/api/v1/me', {}, transport);
  assert.equal(result.status, 200);
  assert.equal(details.anonymous, true);
  assert.equal(details.redirect, 'error');
  assert.equal(details.timeout, 30000);
  await assert.rejects(Reddit.userscriptRequest('https://oauth.reddit.com/api/v1/me', {}, d => d.onload({ finalUrl: 'https://example.com/' })), { code: 'API_REDIRECT' });
  await assert.rejects(Reddit.userscriptRequest('https://oauth.reddit.com/api/v1/me', {}, d => d.ontimeout()), { code: 'NETWORK_ERROR' });
  await assert.rejects(Reddit.userscriptRequest('https://oauth.reddit.com/api/v1/me', {}, d => d.onload({ finalUrl: 'not-a-url' })), { code: 'UNRECOGNIZED_RESPONSE' });
  await assert.rejects(Reddit.userscriptRequest('https://oauth.reddit.com/api/v1/me', {}, () => { throw new Error('Extension unavailable'); }), { code: 'NETWORK_ERROR' });
});

test('the transport watchdog ends a request even if the extension loses all callbacks', async () => {
  let deadline;
  let aborted = false;
  const { Reddit } = loadToolbox({ globals: { setTimeout: callback => { deadline = callback; return 1; }, clearTimeout: () => {} } });
  const pending = Reddit.userscriptRequest('https://oauth.reddit.com/api/v1/me', {}, () => ({ abort: () => { aborted = true; } }));
  deadline();
  await assert.rejects(pending, { code: 'NETWORK_ERROR' });
  assert.equal(aborted, true);
});

test('popup accepts only the matching state, source window and Reddit origin', async () => {
  const { Reddit } = fixture();
  let listener;
  let authUrl;
  let removed = false;
  const popup = { closed: false, close() { this.closed = true; } };
  const host = { location: { origin: 'https://www.reddit.com' },
    addEventListener: (_type, handler) => { listener = handler; },
    removeEventListener: () => { removed = true; },
    open: url => { authUrl = new URL(url); return popup; } };
  const pending = Reddit.requestAuthorization('fixture-client', host);
  const state = authUrl.searchParams.get('state');
  assert.match(state, /^[a-z]{64}$/);
  const event = { origin: 'https://www.reddit.com', source: popup, data: { type: 'reddit-toolbox:oauth-code', state, code: 'fixture-code' } };
  listener({ ...event, origin: 'https://example.com' });
  listener({ ...event, source: {} });
  listener({ ...event, data: { ...event.data, state: 'wrong' } });
  assert.equal(removed, false);
  listener(event);
  assert.equal(await pending, 'fixture-code');
  assert.equal(removed, true);
  assert.equal(popup.closed, true);
});

test('score and subreddit protection retain archive items whose protected fields are unknown', () => {
  const { Core } = fixture();
  const row = { fullname: 't1_test', kind: 'comment', createdAt: Date.now(), score: null, subreddit: '' };
  assert.equal(Core.evaluateItem(row, { keepScoreAtOrAbove: 10 }), 'unknown-score');
  assert.equal(Core.evaluateItem(row, { keepSubreddits: 'test' }), 'unknown-subreddit');
  assert.equal(Core.evaluateItem({ ...row, score: 0 }, { keepScoreAtOrAbove: 10 }), null);
});
