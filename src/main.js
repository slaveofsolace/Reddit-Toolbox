(() => {
  'use strict';

  const toolbox = globalThis.RedditToolbox;
  if (toolbox.Reddit.receiveOAuthCallback()) return;
  toolbox.App ||= {};

  toolbox.App.start = () => {
    if (globalThis.__redditToolboxApp) return globalThis.__redditToolboxApp;
    const app = new toolbox.UI.RedditToolboxApp().mount();
    globalThis.__redditToolboxApp = app;
    if (typeof GM_registerMenuCommand === 'function') {
      GM_registerMenuCommand('Open Reddit Toolbox', () => app.open());
    }
    return app;
  };

  const boot = () => {
    if (document.body) toolbox.App.start();
    else document.addEventListener('DOMContentLoaded', () => toolbox.App.start(), { once: true });
  };

  if (typeof document !== 'undefined') boot();
})();
