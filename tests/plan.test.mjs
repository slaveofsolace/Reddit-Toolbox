import test from 'node:test';
import assert from 'node:assert/strict';
import { loadToolbox } from './load-toolbox.mjs';

const { Core } = loadToolbox({
  files: [
    'src/core/namespace.js',
    'src/core/random.js',
    'src/core/plan.js'
  ]
});

const items = [
  { fullname: 't1_a', kind: 'comment' },
  { fullname: 't3_b', kind: 'post' }
];

test('createPlan binds one automated-batch confirmation to targets and options', () => {
  const plan = Core.createPlan(items, { verifyOverwrite: true, replacementLength: 24 }, 1_000);
  assert.equal(plan.version, 2);
  assert.equal(plan.mode, 'automated-batch');
  assert.equal(plan.confirmation, 'DELETE 2 ITEMS');
  assert.equal(plan.items.length, 2);
  assert.equal(Core.isPlanCurrent(plan), true);
});

test('isPlanCurrent detects target mutation', () => {
  const plan = Core.createPlan(items, {}, 1_000);
  plan.items[0].content.fullname = 't1_changed';
  assert.equal(Core.isPlanCurrent(plan), false);
});

test('isPlanCurrent detects destructive option mutation', () => {
  const plan = Core.createPlan(items, { deleteUneditablePosts: false }, 1_000);
  plan.options.deleteUneditablePosts = true;
  assert.equal(Core.isPlanCurrent(plan), false);
});

test('isPlanCurrent detects a change from overwrite to direct-delete handling', () => {
  const plan = Core.createPlan([{ fullname: 't3_a', kind: 'post', editable: true }], {});
  plan.items[0].content.editable = false;
  assert.equal(Core.isPlanCurrent(plan), false);
});

test('planSummary reports processed, remaining, and percent for the whole batch', () => {
  const plan = Core.createPlan(items, {});
  plan.items[0].status = 'completed';
  const summary = Core.planSummary(plan);
  assert.equal(summary.processed, 1);
  assert.equal(summary.remaining, 1);
  assert.equal(summary.percent, 50);
});

test('createRetryPlan includes failed and stopped items only', () => {
  const plan = Core.createPlan([
    { fullname: 't1_a', kind: 'comment' },
    { fullname: 't1_b', kind: 'comment' },
    { fullname: 't1_c', kind: 'comment' }
  ], {}, 1_000);
  plan.items[0].status = 'completed';
  plan.items[1].status = 'failed';
  plan.items[2].status = 'stopped';

  const retry = Core.createRetryPlan(plan, 2_000);
  assert.deepEqual(
    Array.from(retry.items, (item) => item.content.fullname),
    ['t1_b', 't1_c']
  );
  assert.equal(retry.retryOf, plan.id);
  assert.equal(retry.retryNumber, 1);
});
