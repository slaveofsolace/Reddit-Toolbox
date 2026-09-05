import test from 'node:test';
import assert from 'node:assert/strict';
import { loadToolbox } from './load-toolbox.mjs';

const { UI } = loadToolbox({
  files: [
    'src/core/namespace.js',
    'src/core/errors.js',
    'src/core/random.js',
    'src/core/plan.js',
    'src/core/runner.js',
    'src/ui/styles.js',
    'src/ui/template.js',
    'src/ui/app.js',
    'src/ui/scope.js',
    'src/ui/run.js'
  ]
});

test('review leads directly to a clearly labeled delete action without typed confirmation', () => {
  assert.match(UI.staticMarkup, /Find matching items/);
  assert.match(UI.staticMarkup, />No limit<\/option>/);
  assert.match(UI.staticMarkup, />Set a limit<\/option>/);
  assert.match(UI.staticMarkup, /Delete selected items/);
  assert.match(UI.staticMarkup, /Deletion is permanent/);
  assert.doesNotMatch(UI.staticMarkup, /confirmation-input|Prepare batch|replacement-length/);
});

test('batch UI exposes progress, pause, stop, and retry controls', () => {
  assert.equal(typeof UI.RedditToolboxApp.prototype.prepareRetryBatch, 'function');
  assert.equal(UI.batchPhaseLabel('checking-session'), 'Rechecking the signed-in account');
  assert.equal(UI.batchPhaseLabel('overwriting'), 'Overwriting the original text');
  assert.match(UI.staticMarkup, /processed-count/);
  assert.match(UI.staticMarkup, /remaining-count/);
  assert.equal(typeof UI.RedditToolboxApp.prototype.recheckResults, 'function');
  assert.match(UI.staticMarkup, /Recheck results/);
});

test('active batches warn before the tab unloads', () => {
  const store = { get: (_name, fallback) => fallback, set: () => true };
  const app = new UI.RedditToolboxApp({ store });
  let prevented = false;
  const event = {
    returnValue: undefined,
    preventDefault() { prevented = true; }
  };

  app.runner = { state: 'running' };
  app.beforeUnloadHandler(event);
  assert.equal(prevented, true);
  assert.equal(event.returnValue, '');

  prevented = false;
  event.returnValue = undefined;
  app.runner = { state: 'completed' };
  app.beforeUnloadHandler(event);
  assert.equal(prevented, false);
  assert.equal(event.returnValue, undefined);
});
