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

test('batch UI requires one confirmation and no per-item clicks', () => {
  assert.match(UI.staticMarkup, /One confirmation starts the entire selected batch/);
  assert.match(UI.staticMarkup, /No per-item clicks are required/);
  assert.match(UI.staticMarkup, /Run entire batch/);
  assert.match(UI.staticMarkup, /continues while this panel is closed/);
  assert.doesNotMatch(UI.staticMarkup, /deletes it one item at a time/i);
});

test('batch UI exposes progress, pause, stop, and retry controls', () => {
  assert.equal(typeof UI.RedditToolboxApp.prototype.prepareRetryBatch, 'function');
  assert.equal(UI.batchPhaseLabel('checking-session'), 'Rechecking the signed-in account');
  assert.equal(UI.batchPhaseLabel('overwriting'), 'Overwriting the original text');
  assert.match(UI.staticMarkup, /processed-count/);
  assert.match(UI.staticMarkup, /remaining-count/);
  assert.match(UI.staticMarkup, /Prepare retry batch/);
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
