(() => {
  'use strict';

  const { Core } = globalThis.RedditToolbox;

  class ToolboxError extends Error {
    constructor(message, options = {}) {
      super(message);
      this.name = new.target.name;
      this.code = options.code || 'TOOLBOX_ERROR';
      this.status = options.status || 0;
      this.retryable = options.retryable === true;
      this.pauseRequired = options.pauseRequired === true;
      this.details = options.details || null;
    }
  }

  class ApiError extends ToolboxError {}

  class AuthError extends ToolboxError {
    constructor(message = 'Sign in before using this toolbox.', options = {}) {
      super(message, {
        ...options,
        code: options.code || 'AUTH_REQUIRED',
        pauseRequired: true
      });
    }
  }

  class RateLimitError extends ToolboxError {
    constructor(message = 'The service asked the tool to slow down.', retryAfterMs = 60_000, options = {}) {
      super(message, {
        ...options,
        code: options.code || 'RATE_LIMITED',
        retryable: true
      });
      this.retryAfterMs = Math.max(1_000, Number(retryAfterMs) || 60_000);
    }
  }

  class PauseRequiredError extends ToolboxError {
    constructor(message, options = {}) {
      super(message, {
        ...options,
        code: options.code || 'PAUSE_REQUIRED',
        pauseRequired: true
      });
    }
  }

  Core.ToolboxError = ToolboxError;
  Core.ApiError = ApiError;
  Core.AuthError = AuthError;
  Core.RateLimitError = RateLimitError;
  Core.PauseRequiredError = PauseRequiredError;
})();
