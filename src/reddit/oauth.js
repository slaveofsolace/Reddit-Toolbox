(() => {
  'use strict';

  const { Core, Reddit } = globalThis.RedditToolbox;
  const SITE = 'https://www.reddit.com';
  const API = 'https://oauth.reddit.com';
  const REDIRECT = `${SITE}/?reddit-toolbox=oauth-callback`;
  const SCOPES = ['identity', 'history', 'read', 'edit'];
  const CALLBACK_TYPE = 'reddit-toolbox:oauth-code';

  function assertCanonicalOrigin(origin = globalThis.location?.origin) {
    if (origin !== SITE) throw new Core.AuthError('Open www.reddit.com to connect and run cleanup.', { code: 'CANONICAL_ORIGIN_REQUIRED' });
  }

  function clientId(value) {
    const id = String(value || '').trim();
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(id)) throw new Core.AuthError('Enter the public client ID of your approved Reddit installed app.', { code: 'OAUTH_CLIENT_REQUIRED' });
    return id;
  }

  function authorizationUrl(id, state) {
    const url = new URL('/api/v1/authorize', SITE);
    url.search = new URLSearchParams({ client_id: clientId(id), response_type: 'code', state,
      redirect_uri: REDIRECT, duration: 'permanent', scope: SCOPES.join(' ') }).toString();
    return url.href;
  }

  // The popup returns only a one-use authorization code. Tokens never enter a URL,
  // page storage, GM storage, a backup, or the page-facing app object.
  function receiveOAuthCallback() {
    if (typeof location === 'undefined') return false;
    const url = new URL(location.href);
    if (url.origin !== SITE || url.pathname !== '/' || url.searchParams.get('reddit-toolbox') !== 'oauth-callback') return false;
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.has('error');
    globalThis.history?.replaceState(null, '', `${SITE}/?reddit-toolbox=connection-return`);
    if (globalThis.opener && /^[a-z]{64}$/.test(state || '')) {
      globalThis.opener.postMessage({ type: CALLBACK_TYPE, state, code: error ? null : code, denied: error }, SITE);
    }
    const show = () => {
      const message = document.createElement('p');
      message.textContent = 'Reddit Toolbox: return to the original tab to finish connecting. You can close this tab.';
      message.style.cssText = 'padding:24px;font:16px system-ui';
      document.body.replaceChildren(message);
    };
    if (document.body) show(); else document.addEventListener('DOMContentLoaded', show, { once: true });
    return true;
  }

  function requestAuthorization(id, host = globalThis) {
    assertCanonicalOrigin(host.location?.origin);
    const state = Core.randomLetterString(64);
    const url = authorizationUrl(id, state);
    return new Promise((resolve, reject) => {
      let popup;
      let timer;
      const cleanup = () => { host.removeEventListener('message', onMessage); clearTimeout(timer); };
      const onMessage = (event) => {
        if (event.origin !== SITE || event.source !== popup || event.data?.type !== CALLBACK_TYPE || event.data.state !== state) return;
        cleanup();
        popup?.close();
        if (event.data.denied || typeof event.data.code !== 'string' || !event.data.code || event.data.code.length > 4096) {
          reject(new Core.AuthError('Reddit authorization was declined. No cleanup started.', { code: 'OAUTH_DENIED' }));
        } else resolve(event.data.code);
      };
      host.addEventListener('message', onMessage);
      popup = host.open(url, '_blank', 'popup,width=720,height=780');
      if (!popup) {
        cleanup();
        reject(new Core.AuthError('Allow the Reddit authorization popup, then connect again.', { code: 'OAUTH_POPUP_BLOCKED' }));
        return;
      }
      const expires = Date.now() + 300_000;
      const check = () => {
        if (popup.closed || Date.now() >= expires) {
          cleanup();
          reject(new Core.AuthError('Reddit connection was cancelled or timed out. Connect again when ready.', { code: 'OAUTH_CANCELLED' }));
        } else timer = setTimeout(check, 500);
      };
      timer = setTimeout(check, 500);
    });
  }

  function userscriptRequest(url, options = {}, transport = typeof GM_xmlhttpRequest === 'function' ? GM_xmlhttpRequest : null) {
    if (typeof transport !== 'function') throw new Core.AuthError('Update the script in Tampermonkey to enable its Reddit OAuth permission.', { code: 'USERSCRIPT_PERMISSION_REQUIRED' });
    return new Promise((resolve, reject) => {
      let settled = false;
      let request;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        callback(value);
      };
      const fail = () => finish(reject, new Core.ApiError('The Reddit request did not complete.', { code: 'NETWORK_ERROR', retryable: true }));
      // GM's fetch-backed mode does not honor every native XHR option in every
      // browser. Keep our own deadline, including when an extension callback is lost.
      const watchdog = setTimeout(() => { fail(); request?.abort?.(); }, 31_000);
      try { request = transport({
        url: String(url), method: options.method || 'GET', headers: options.headers || {},
        data: options.body ? String(options.body) : undefined,
        anonymous: true, redirect: 'error', timeout: 30_000,
        onerror: fail, ontimeout: fail, onabort: fail,
        onload(response) {
          if (settled) return;
          try {
          const target = new URL(url);
          const finalUrl = new URL(response.finalUrl || url);
          if (target.origin !== finalUrl.origin || target.pathname !== finalUrl.pathname) {
            finish(reject, new Core.PauseRequiredError('Reddit redirected the API request. Its result needs review.', { code: 'API_REDIRECT' }));
            return;
          }
          const headers = new Map(String(response.responseHeaders || '').split(/\r?\n/).map((line) => {
            const colon = line.indexOf(':');
            return [line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim()];
          }));
          finish(resolve, { status: response.status, ok: response.status >= 200 && response.status < 300,
            headers: { get: (name) => headers.get(name.toLowerCase()) || null },
            text: async () => String(response.responseText || '') });
          } catch { finish(reject, new Core.ApiError('Reddit returned an unreadable response.', { code: 'UNRECOGNIZED_RESPONSE', retryable: true })); }
        }
      }); } catch { fail(); }
    });
  }

  class RedditOAuthClient extends Reddit.RedditSessionClient {
    #accessToken = '';
    #refreshToken = '';
    #expiresAt = 0;
    #clientId = '';
    #refreshing = null;
    #queue = Promise.resolve();
    #nextRequestAt = 0;
    constructor(options = {}) {
      super(options);
      this.send = options.send || userscriptRequest;
      this.authorize = options.authorize || requestAuthorization;
      this.sleep = options.sleep || Core.wait;
      this.siteClient = options.siteClient || new Reddit.RedditSessionClient(options);
    }

    async connect(id) {
      assertCanonicalOrigin(this.origin);
      const registeredId = clientId(id);
      const code = await this.authorize(registeredId);
      // Finish validation before replacing any still-usable connection.
      const tokens = await this.exchange(registeredId, { grant_type: 'authorization_code', code, redirect_uri: REDIRECT });
      this.#clientId = registeredId;
      this.#refreshToken = '';
      this.acceptTokens(tokens);
      return this.getSession();
    }

    disconnect() {
      this.#accessToken = '';
      this.#refreshToken = '';
      this.#expiresAt = 0;
      this.#clientId = '';
      this.username = '';
    }

    get connected() { return Boolean(this.#accessToken); }

    async exchange(id, values) {
      const response = await this.send(`${SITE}/api/v1/access_token`, {
        method: 'POST',
        headers: { Authorization: `Basic ${btoa(`${id}:`)}`, Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'browser:RedditToolbox:1.0.0-rc.3 (by /u/slaveofsolace)' },
        body: new URLSearchParams(values)
      });
      const tokens = await this.readResponse(response);
      const scopes = String(tokens.scope || '').split(/[ ,]+/);
      if (tokens.token_type?.toLowerCase() !== 'bearer' || typeof tokens.access_token !== 'string' || !tokens.access_token
        || !Number.isFinite(Number(tokens.expires_in)) || Number(tokens.expires_in) <= 0
        || !SCOPES.every((scope) => scopes.includes(scope))) {
        throw new Core.AuthError('Reddit did not grant all permissions needed for your history cleanup.', { code: 'OAUTH_SCOPE_MISSING' });
      }
      return tokens;
    }

    acceptTokens(tokens) {
      this.#accessToken = tokens.access_token;
      if (tokens.refresh_token) this.#refreshToken = tokens.refresh_token;
      this.#expiresAt = Date.now() + Number(tokens.expires_in) * 1000;
    }

    async token() {
      if (!this.#accessToken) throw new Core.AuthError('Connect your Reddit account first.', { code: 'OAUTH_NOT_CONNECTED' });
      if (Date.now() < this.#expiresAt - 60_000) return this.#accessToken;
      if (!this.#refreshToken) throw new Core.AuthError('Your connection expired. Connect again, then resume the batch.', { code: 'OAUTH_EXPIRED' });
      if (!this.#refreshing) {
        this.#refreshing = (async () => {
          try { this.acceptTokens(await this.exchange(this.#clientId, { grant_type: 'refresh_token', refresh_token: this.#refreshToken })); }
          catch { throw new Core.AuthError('Reddit could not renew this connection. Connect again, then resume.', { code: 'OAUTH_EXPIRED' }); }
          finally { this.#refreshing = null; }
        })();
      }
      await this.#refreshing;
      return this.#accessToken;
    }

    url(path) {
      const url = new URL(path, API);
      if (url.origin !== API || url.username || url.password || url.hash) throw new Core.ApiError('Unsupported Reddit API destination.', { code: 'API_DESTINATION' });
      return url;
    }

    async request(path, options = {}) {
      assertCanonicalOrigin(this.origin);
      const url = this.url(path);
      const method = options.method || 'GET';
      const allowed = method === 'GET'
        ? /^\/api\/v1\/me$|^\/api\/info\.json$|^\/user\/[a-zA-Z0-9_-]+\/(comments|submitted)\.json$/.test(url.pathname)
        : method === 'POST' && ['/api/editusertext', '/api/del'].includes(url.pathname);
      if (!allowed) throw new Core.ApiError('This API operation is outside Reddit Toolbox history cleanup.', { code: 'API_OPERATION' });
      const operation = this.#queue.then(async () => {
        const wait = this.#nextRequestAt - Date.now();
        if (wait > 1000) throw new Core.RateLimitError('Reddit rate-limit budget is resting.', wait);
        if (wait > 0) await this.sleep(wait);
        const token = await this.token();
        this.#nextRequestAt = Date.now() + 700;
        const response = await this.send(url.href, { ...options,
          headers: { ...options.headers, Authorization: `Bearer ${token}`, 'User-Agent': 'browser:RedditToolbox:1.0.0-rc.3 (by /u/slaveofsolace)' } });
        const remaining = response.headers?.get?.('x-ratelimit-remaining');
        const reset = Number(response.headers?.get?.('x-ratelimit-reset'));
        if (remaining !== null && remaining !== undefined && Number(remaining) <= 1 && reset > 0) this.#nextRequestAt = Date.now() + Math.ceil(reset * 1000) + 1000;
        if (response.status === 401) this.#expiresAt = 0;
        return this.readResponse(response);
      });
      this.#queue = operation.catch(() => {});
      return operation;
    }

    async postForm(path, values) {
      return this.request(path, { method: 'POST', headers: { Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(values) });
    }

    async getSession() {
      const identity = await this.getJson('/api/v1/me');
      if (!identity?.name) throw new Core.AuthError('Reddit did not return an authorized account.', { code: 'OAUTH_IDENTITY' });
      const session = await this.siteClient.getSession();
      if (!Reddit.sameUsername(identity.name, session.username)) throw new Core.PauseRequiredError('The authorized account differs from the signed-in Reddit account. Connect the account shown on this page.', { code: 'ACCOUNT_CHANGED' });
      this.username = String(identity.name);
      return { username: this.username };
    }
  }

  Reddit.OAUTH_REDIRECT = REDIRECT;
  Reddit.authorizationUrl = authorizationUrl;
  Reddit.receiveOAuthCallback = receiveOAuthCallback;
  Reddit.requestAuthorization = requestAuthorization;
  Reddit.userscriptRequest = userscriptRequest;
  Reddit.RedditOAuthClient = RedditOAuthClient;
})();
