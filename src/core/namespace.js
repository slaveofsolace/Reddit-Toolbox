(() => {
  'use strict';

  const family = globalThis.ToolboxFamily || {};
  family.Core ||= {};
  family.version = '1.0.0-rc.1';

  const toolbox = globalThis.RedditToolbox || {};
  toolbox.Core = family.Core;
  toolbox.Reddit ||= {};
  toolbox.UI ||= {};
  toolbox.version = '1.0.0-rc.1';

  globalThis.ToolboxFamily = family;
  globalThis.RedditToolbox = toolbox;
})();
