import test from 'node:test';
import assert from 'node:assert/strict';
import { loadToolbox } from './load-toolbox.mjs';

const { Core } = loadToolbox();
const items = [
  { fullname: 't1_a', kind: 'comment' },
  { fullname: 't3_b', kind: 'post' }
];

test('createPlan binds confirmation to reviewed targets and options', () => {
  const plan = Core.createPlan(items, { verifyOverwrite: true, replacementLength: 24 }, 1000);
  assert.equal(plan.confirmation, 'DELETE 2 ITEMS');
  assert.equal(plan.items.length, 2);
  assert.equal(Core.isPlanCurrent(plan), true);
});

test('isPlanCurrent detects target mutation', () => {
  const plan = Core.createPlan(items, {}, 1000);
  plan.items[0].content.fullname = 't1_changed';
  assert.equal(Core.isPlanCurrent(plan), false);
});

test('isPlanCurrent detects destructive option mutation', () => {
  const plan = Core.createPlan(items, { deleteUneditablePosts: false }, 1000);
  plan.options.deleteUneditablePosts = true;
  assert.equal(Core.isPlanCurrent(plan), false);
});


test('isPlanCurrent detects a change from overwrite to direct-delete handling', () => {
  const plan = Core.createPlan([{ fullname: 't3_a', kind: 'post', editable: true }], {});
  plan.items[0].content.editable = false;
  assert.equal(Core.isPlanCurrent(plan), false);
});
