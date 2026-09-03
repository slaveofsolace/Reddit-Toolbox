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

  class RedditSessionClient {
    constructor(options = {}) {
      const defaultFetch = globalThis.fetch?.bind(globalThis);
      this.fetch = options.fetchImpl || defaultFetch;
      this.origin = options.origin || globalThis.location?.origin || 'https://www.reddit.com';
      this.modhash = options.modhash || '';
      this.username = options.username || '';
      if (typeof this.fetch !== 'function') throw new Error('Fetch is unavailable.');
    }

    url(path) {
      const url = new URL(path, this.origin);
      if (!/(^|\.)reddit\.com$/i.test(url.hostname)) {
        throw new Error('Reddit Toolbox only sends requests to reddit.com.');
      }
      return url;
    }

    async readResponse(response) {
      const contentType = response.headers?.get?.('content-type') || '';
      const text = await response.text();
      let payload = null;
      if (text && (contentType.includes('json') || /^[\s]*[\[{]/.test(text))) {
        try {
          payload = JSON.parse(text);
        } catch {
          throw new Core.ApiError('Reddit returned malformed JSON.', {
            code: 'INVALID_JSON',
            status: response.status,
            retryable: response.status >= 500
          });
        }
      }

      if (response.status === 429) {
        throw new Core.RateLimitError(
          'Reddit asked the tool to slow down.',
          retryAfterMilliseconds(response)
        );
      }
      if (response.status === 401) {
        throw new Core.AuthError('Your Reddit session expired. Sign in again, then resume.', {
          status: response.status
        });
      }
      if (response.status === 403) {
        throw new Core.PauseRequiredError(
          'Reddit blocked this request. Check the page for a challenge or account notice, then resume.',
          { code: 'REDDIT_FORBIDDEN', status: response.status }
        );
      }
      if (!response.ok) {
        throw new Core.ApiError(`Reddit returned HTTP ${response.status}.`, {
          code: `HTTP_${response.status}`,
          status: response.status,
          retryable: response.status >= 500
        });
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

      return payload;
    }

    async getJson(path) {
      let response;
      try {
        response = await this.fetch(this.url(path), {
          method: 'GET',
          credentials: 'include',
          headers: { Accept: 'application/json' }
        });
      } catch (error) {
        throw new Core.ApiError('Could not reach Reddit.', {
          code: 'NETWORK_ERROR',
          retryable: true,
          details: error
        });
      }
      return this.readResponse(response);
    }

    async postForm(path, values) {
      if (!this.modhash) throw new Core.AuthError('Reddit did not provide a session modhash. Refresh and sign in again.');
      const body = new URLSearchParams({ ...values, uh: this.modhash });
      let response;
      try {
        response = await this.fetch(this.url(path), {
          method: 'POST',
          credentials: 'include',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            'X-Modhash': this.modhash
          },
          body
        });
      } catch (error) {
        throw new Core.ApiError('Could not reach Reddit.', {
          code: 'NETWORK_ERROR',
          retryable: true,
          details: error
        });
      }
      return this.readResponse(response);
    }

    async getSession(requireModhash = false) {
      const payload = await this.getJson('/api/me.json?raw_json=1');
      const data = payload?.data;
      if (!data?.name) throw new Core.AuthError();
      this.username = String(data.name);
      this.modhash = String(data.modhash || '');
      if (requireModhash && !this.modhash) {
        throw new Core.AuthError(
          'Reddit found the signed-in account but did not expose an action token on this surface. Open old.reddit.com, reload, and retry.',
          { code: 'MODHASH_MISSING' }
        );
      }
      return { username: this.username, modhash: this.modhash };
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
      const children = Array.isArray(payload?.data?.children) ? payload.data.children : [];
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
      const params = new URLSearchParams({ id: fullname, raw_json: '1' });
      const payload = await this.getJson(`/api/info.json?${params}`);
      const child = payload?.data?.children?.[0];
      if (!child || !['t1', 't3'].includes(child.kind)) return null;
      const actualFullname = Reddit.normalizeFullname(
        child.data?.name || child.data?.id,
        child.kind === 't1' ? 'comment' : 'post'
      );
      return actualFullname === fullname ? child : null;
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

    async isDeleted(fullname) {
      const child = await this.getThing(fullname);
      if (!child) return true;
      const author = String(child.data?.author || '').toLowerCase();
      const text = String(child.kind === 't1' ? child.data?.body ?? '' : child.data?.selftext ?? '').toLowerCase();
      return (!author || author === '[deleted]') && ['', '[deleted]', '[removed]'].includes(text);
    }

    async delete(fullname) {
      return this.postForm('/api/del', { id: fullname });
    }
  }

  Reddit.retryAfterMilliseconds = retryAfterMilliseconds;
  Reddit.rateLimitFromMessage = rateLimitFromMessage;
  Reddit.apiErrors = apiErrors;
  Reddit.RedditSessionClient = RedditSessionClient;
})();
