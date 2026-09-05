(() => {
  'use strict';

  const { Core, Reddit } = globalThis.RedditToolbox;
  // Non-OAuth requests have historically received 100 requests per 10 minutes.
  // Leave headroom and count every read, edit, delete, and verification request.
  const MINIMUM_REQUEST_INTERVAL_MS = 7_500;
  const BUDGET_KEY = 'request-budget';
  const numberHeader = (response, name) => {
    const raw = response?.headers?.get?.(name);
    return raw !== null && raw !== undefined && String(raw).trim() !== '' && Number.isFinite(Number(raw))
      ? Number(raw) : null;
  };

  class RequestPacer {
    constructor(options = {}) {
      this.now = options.now || Date.now;
      this.sleep = options.sleep || Core.wait;
      this.store = options.store || new Core.SettingsStore();
      this.lockManager = options.lockManager === undefined ? globalThis.navigator?.locks : options.lockManager;
      this.state = { nextRequestAt: 0, cooldownUntil: 0 };
      this.queue = Promise.resolve();
    }

    readState() {
      const saved = this.store.get(BUDGET_KEY, {}) || {};
      for (const key of ['nextRequestAt', 'cooldownUntil']) {
        if (Number.isFinite(saved[key]) && saved[key] >= 0) this.state[key] = Math.max(this.state[key], saved[key]);
      }
      return this.state;
    }

    save() {
      this.store.set(BUDGET_KEY, { ...this.state });
    }

    defer(milliseconds) {
      this.readState();
      this.state.cooldownUntil = Math.max(this.state.cooldownUntil, this.now() + Math.max(1_000, milliseconds));
      this.save();
    }

    observe(response) {
      const remaining = numberHeader(response, 'x-ratelimit-remaining');
      const reset = numberHeader(response, 'x-ratelimit-reset');
      if (remaining === null || reset === null || reset <= 0) return;
      this.readState();
      const resetMs = Math.ceil(reset * 1_000) + 1_000;
      // Spend at most 80% of the reported remaining allowance over its window.
      // With less than two requests left, preserve it until the window resets.
      const available = Math.floor(Math.floor(remaining) * 0.8);
      if (available < 1) this.defer(resetMs);
      else {
        this.state.nextRequestAt = Math.max(this.state.nextRequestAt, this.now() + Math.ceil(resetMs / available));
        this.save();
      }
    }

    run(operation, { onWait, checkpoint } = {}) {
      const execute = async () => {
        let waiting = false;
        for (;;) {
          await checkpoint?.();
          const state = this.readState();
          const remainingMs = Math.max(state.nextRequestAt, state.cooldownUntil) - this.now();
          if (remainingMs <= 0) break;
          waiting = true;
          onWait?.({ remainingMs, reason: state.cooldownUntil > this.now() ? 'cooldown' : 'pacing' });
          await this.sleep(Math.min(1_000, remainingMs));
        }
        if (waiting) onWait?.({ remainingMs: 0 });
        this.state.nextRequestAt = this.now() + MINIMUM_REQUEST_INTERVAL_MS;
        this.save();
        // The slot is consumed even if transport fails: Reddit may have received it.
        return operation();
      };
      const scheduled = this.queue.then(() => this.lockManager?.request
        ? this.lockManager.request('reddit-toolbox-requests', { mode: 'exclusive' }, execute)
        : execute());
      this.queue = scheduled.catch(() => {});
      return scheduled.finally(() => onWait?.({ remainingMs: 0 }));
    }
  }

  Reddit.MINIMUM_REQUEST_INTERVAL_MS = MINIMUM_REQUEST_INTERVAL_MS;
  Reddit.RequestPacer = RequestPacer;
})();
