(() => {
  'use strict';

  const { Core, Reddit } = globalThis.RedditToolbox;

  function retryAfterMilliseconds(response, fallback = 60_000) {
    const header = response?.headers?.get?.('retry-after');
    if (!header) return fallback;
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(1_000, seconds * 1_000);
    const date = new Date(header).getTime();
    return Number.isFinite(date) ? Math.max(1_000, date - Date.now()) : fallback;
  }

  function rateLimitFromMessage(message) {
    const text = String(message || '');
    const match = text.match(/(\d+)\s*(second|minute|hour)/i);
    if (!match) return 60_000;
    const unit = match[2].toLowerCase();
    const multiplier = unit === 'hour' ? 3_600_000 : unit === 'minute' ? 60_000 : 1_000;
    return Number(match[1]) * multiplier;
  }

  function apiErrors(payload) {
    const errors = payload?.json?.errors;
    if (!Array.isArray(errors)) return [];
    return errors.map((entry) => ({
      code: String(entry?.[0] || 'REDDIT_ERROR'),
      message: String(entry?.[1] || 'Reddit rejected the request.'),
      field: String(entry?.[2] || '')
    }));
  }

  function sameUsername(left, right) {
    return String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase();
  }

  class RedditSessionClient {
    constructor(options = {}) {
      const defaultFetch = globalThis.fetch?.bind(globalThis);
      this.fetch = options.fetchImpl || defaultFetch;
      this.origin = options.origin || globalThis.location?.origin || 'https://www.reddit.com';
      this.modhash = options.modhash || '';
      this.username = options.username || '';
      this.requestTimeoutMs = Math.max(100, Math.min(60_000, Number(options.requestTimeoutMs) || 30_000));
      if (typeof this.fetch !== 'function') throw new Error('Fetch is unavailable.');
    }

    url(path) {
      const url = new URL(path, this.origin);
      if (url.protocol !== 'https:' || url.origin !== this.origin || url.username || url.password
        || !['www.reddit.com', 'old.reddit.com', 'new.reddit.com', 'sh.reddit.com'].includes(url.hostname)) {
        throw new Error('Reddit Toolbox only sends requests to its approved Reddit origin.');
      }
      return url;
    }

    async readResponse(response) {
      const contentType = response.headers?.get?.('content-type') || '';
      // Interpret definite HTTP rejection before attempting to read a possibly broken body.
      if (response.status === 429) throw new Core.RateLimitError('Reddit asked the tool to slow down.', retryAfterMilliseconds(response));
      if (response.status === 401) throw new Core.AuthError('Your Reddit session expired. Sign in again, then resume.', { status: 401 });
      if (response.status === 403) throw new Core.PauseRequiredError('Reddit blocked this request. Check the page for an account notice.', { code: 'REDDIT_FORBIDDEN', status: 403 });
      let text;
      try { text = await response.text(); } catch {
        throw new Core.ApiError('Reddit response was interrupted.', { code: 'RESPONSE_LOST', status: response.status, retryable: true });
      }
      let payload = null;
      if (text && (contentType.includes('json') || /^[\s]*[\[{]/.test(text))) {
        try {
          payload = JSON.parse(text);
        } catch {
          throw new Core.ApiError('Reddit returned malformed JSON.', {
            code: 'INVALID_JSON',
            status: response.status,
            retryable: true
          });
        }
      }

      if (!response.ok) {
        throw new Core.ApiError(`Reddit returned HTTP ${response.status}.`, {
          code: `HTTP_${response.status}`,
          status: response.status,
          retryable: response.status >= 500
        });
      }

      if (payload?.success === false || payload?.error) {
        const status = Number(payload.error);
        if (status === 401) throw new Core.AuthError();
        if (status === 403) throw new Core.PauseRequiredError('Reddit rejected this request. Check the account notice on the page.', { code: 'REDDIT_FORBIDDEN', status });
        if (status === 429) throw new Core.RateLimitError('Reddit asked the tool to slow down.', retryAfterMilliseconds(response));
        throw new Core.ApiError('Reddit rejected the operation.', { code: 'REDDIT_REJECTED' });
      }

      const errors = apiErrors(payload);
      if (errors.length) {
        const first = errors[0];
        if (first.code.toUpperCase().includes('RATELIMIT')) {
          throw new Core.RateLimitError(first.message, rateLimitFromMessage(first.message), {
            details: errors
          });
        }
        if (/captcha|challenge|verification/i.test(`${first.code} ${first.message}`)) {
          throw new Core.PauseRequiredError(first.message, {
            code: first.code,
            details: errors
          });
        }
        throw new Core.ApiError(first.message, {
          code: first.code,
          details: errors
        });
      }

      if (text && (!payload || typeof payload !== 'object')) {
        throw new Core.PauseRequiredError('Reddit returned an unrecognized response. Check the page before resuming.', { code: 'UNRECOGNIZED_RESPONSE', status: response.status });
      }
      return payload;
    }

    async request(path, init) {
      const url = this.url(path);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
      try {
        const response = await this.fetch(url, {
          ...init,
          credentials: 'include',
          cache: 'no-store',
          redirect: 'error',
          signal: controller.signal
        });
        return await this.readResponse(response);
      } catch (error) {
        if (error instanceof Core.ToolboxError) throw error;
        throw new Core.ApiError('The Reddit request did not complete.', {
          code: 'NETWORK_ERROR',
          retryable: true
        });
      } finally {
        clearTimeout(timeout);
      }
    }

    async getJson(path) {
      return this.request(path, { method: 'GET', headers: { Accept: 'application/json' } });
    }

    async postForm(path, values) {
      if (this.origin !== 'https://www.reddit.com') throw new Core.AuthError('Open www.reddit.com for cleanup. A single origin is required for the cross-tab lock.', { code: 'CANONICAL_ORIGIN_REQUIRED' });
      if (!this.modhash) throw new Core.AuthError('Reddit did not provide a session modhash. Refresh and sign in again.');
      const body = new URLSearchParams({ ...values, uh: this.modhash });
      return this.request(path, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            'X-Modhash': this.modhash
          },
          body
      });
    }

    async getSession(requireModhash = false) {
      // Never retain action credentials after a failed session refresh.
      this.username = '';
      this.modhash = '';
      const payload = await this.getJson('/api/me.json?raw_json=1');
      const data = payload?.data;
      if (!data?.name) throw new Core.AuthError();
      this.username = String(data.name);
      this.modhash = String(data.modhash || '');
      if (requireModhash && !this.modhash) {
        throw new Core.AuthError(
          'Reddit did not provide its session action token. Refresh the page and sign in again before cleanup.',
          { code: 'MODHASH_MISSING' }
        );
      }
      return { username: this.username, modhash: this.modhash };
    }

    async assertSession(expectedUsername, requireModhash = true) {
      const session = await this.getSession(requireModhash);
      if (expectedUsername && !sameUsername(session.username, expectedUsername)) {
        throw new Core.PauseRequiredError(
          'The signed-in Reddit account changed. Switch back to the reviewed account before resuming.',
          {
            code: 'ACCOUNT_CHANGED',
          }
        );
      }
      return session;
    }

    async listUserContent(kind, options = {}) {
      if (!this.username) await this.getSession();
      const section = kind === 'comment' ? 'comments' : 'submitted';
      const params = new URLSearchParams({
        raw_json: '1',
        limit: String(Math.min(100, Math.max(1, Number(options.limit) || 100))),
        sort: 'new',
        t: 'all',
        count: String(Math.max(0, Number(options.count) || 0))
      });
      if (options.after) params.set('after', options.after);
      const path = `/user/${encodeURIComponent(this.username)}/${section}.json?${params}`;
      const payload = await this.getJson(path);
      if (!Array.isArray(payload?.data?.children)) throw new Core.ApiError('Reddit did not return a valid history listing.', { code: 'INVALID_LISTING' });
      const children = payload.data.children;
      return {
        items: children.map(Reddit.listingChildToItem).filter(Boolean),
        after: payload?.data?.after || null
      };
    }

    async edit(fullname, text) {
      return this.postForm('/api/editusertext', {
        api_type: 'json',
        raw_json: '1',
        return_rtjson: 'false',
        thing_id: fullname,
        text
      });
    }

    async getThing(fullname) {
      if (!/^t[13]_[a-z0-9]+$/.test(fullname)) throw new Core.ApiError('Invalid content ID.', { code: 'INVALID_TARGET' });
      const params = new URLSearchParams({ id: fullname, raw_json: '1' });
      const payload = await this.getJson(`/api/info.json?${params}`);
      const children = payload?.data?.children;
      if (!Array.isArray(children)) throw new Core.PauseRequiredError('Reddit did not return a valid item listing.', { code: 'INVALID_LISTING' });
      if (!children.length) return null;
      const child = children[0];
      if (children.length !== 1 || !['t1', 't3'].includes(child.kind)) throw new Core.PauseRequiredError('Reddit returned an unexpected target.', { code: 'TARGET_MISMATCH' });
      const actualFullname = Reddit.normalizeFullname(
        child.data?.name || child.data?.id,
        child.kind === 't1' ? 'comment' : 'post'
      );
      if (actualFullname !== fullname) throw new Core.PauseRequiredError('Reddit returned a different target.', { code: 'TARGET_MISMATCH' });
      return child;
    }

    async inspectTarget(fullname) {
      const child = await this.getThing(fullname);
      if (!child) return { available: false, owned: false };
      return {
        available: true,
        owned: sameUsername(child.data?.author, this.username),
        editable: child.kind === 't1' || child.data?.is_self === true
      };
    }

    async verifyOwnership(fullname) {
      if (!this.username) await this.getSession();
      const child = await this.getThing(fullname);
      return Boolean(
        child
        && String(child.data?.author || '').toLowerCase() === this.username.toLowerCase()
      );
    }

    async verifyText(fullname, expected) {
      const child = await this.getThing(fullname);
      if (!child) return false;
      const actual = child.kind === 't1' ? child.data?.body : child.data?.selftext;
      return String(actual ?? '') === String(expected);
    }

    async getDeletionStatus(fullname) {
      const child = await this.getThing(fullname);
      if (!child) return { status: 'missing' };
      const data = child.data;
      const text = String(child.kind === 't1' ? data.body ?? '' : data.selftext ?? '');
      const deletedAuthor = data.author === null || String(data.author).toLowerCase() === '[deleted]';
      const deleted = data.removed_by_category === 'deleted'
        || (deletedAuthor && ['', '[deleted]'].includes(text.trim().toLowerCase()));
      return {
        status: deleted ? 'deleted' : 'present',
        owned: Boolean(this.username && sameUsername(data.author, this.username)),
        editable: child.kind === 't1' || data.is_self === true,
        text
      };
    }

    async isDeleted(fullname) {
      return (await this.getDeletionStatus(fullname)).status === 'deleted';
    }

    async delete(fullname) {
      return this.postForm('/api/del', { id: fullname });
    }
  }

  Reddit.retryAfterMilliseconds = retryAfterMilliseconds;
  Reddit.rateLimitFromMessage = rateLimitFromMessage;
  Reddit.apiErrors = apiErrors;
  Reddit.sameUsername = sameUsername;
  Reddit.RedditSessionClient = RedditSessionClient;
})();
