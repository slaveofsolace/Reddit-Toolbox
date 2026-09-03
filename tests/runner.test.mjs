import test from 'node:test';
import assert from 'node:assert/strict';
import { loadToolbox } from './load-toolbox.mjs';

const { Core } = loadToolbox();
const content = (id) => ({ fullname: `t1_${id}`, kind: 'comment' });

test('ControlledRunner processes one item at a time', async () => {
  const calls = [];
  let active = 0;
  let maximumActive = 0;
  const plan = Core.createPlan([content('a'), content('b')], {});
  const runner = new Core.ControlledRunner(async (item) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    calls.push(item.fullname);
    active -= 1;
    return { status: 'completed', reason: 'done' };
  }, { minimumDelayMs: 0, maximumDelayMs: 0, sleep: async () => {} });

  const summary = await runner.run(plan);
  assert.deepEqual(calls, ['t1_a', 't1_b']);
  assert.equal(maximumActive, 1);
  assert.equal(summary.completed, 2);
});

test('ControlledRunner retries retryable failures', async () => {
  let attempts = 0;
  const plan = Core.createPlan([content('a')], {});
  const runner = new Core.ControlledRunner(async () => {
    attempts += 1;
    if (attempts === 1) throw new Core.ApiError('temporary', { retryable: true });
    return { status: 'completed', reason: 'done' };
  }, { sleep: async () => {}, maxRetries: 2 });

  const summary = await runner.run(plan);
  assert.equal(attempts, 2);
  assert.equal(summary.completed, 1);
});

test('ControlledRunner records permanent failures and continues', async () => {
  const plan = Core.createPlan([content('a'), content('b')], {});
  const runner = new Core.ControlledRunner(async (item) => {
    if (item.fullname === 't1_a') throw new Core.ApiError('nope', { code: 'NOPE' });
    return { status: 'completed', reason: 'done' };
  }, { minimumDelayMs: 0, maximumDelayMs: 0, sleep: async () => {} });

  const summary = await runner.run(plan);
  assert.equal(summary.failed, 1);
  assert.equal(summary.completed, 1);
});


test('ControlledRunner stops before a long cooldown finishes', async () => {
  const plan = Core.createPlan([content('a'), content('b')], {});
  let runner;
  let sleepCalls = 0;
  runner = new Core.ControlledRunner(async () => ({ status: 'completed', reason: 'done' }), {
    minimumDelayMs: 60_000,
    maximumDelayMs: 60_000,
    sleep: async () => { sleepCalls += 1; },
    onEvent: (event) => {
      if (event.type === 'cooldown') runner.stop();
    }
  });

  const summary = await runner.run(plan);
  assert.equal(summary.completed, 1);
  assert.equal(summary.stopped, 1);
  assert.equal(sleepCalls, 0);
});

test('ControlledRunner accepts zero retries and zero delay', () => {
  const runner = new Core.ControlledRunner(async () => {}, {
    minimumDelayMs: 0,
    maximumDelayMs: 0,
    maxRetries: 0
  });
  assert.equal(runner.minimumDelayMs, 0);
  assert.equal(runner.maximumDelayMs, 0);
  assert.equal(runner.maxRetries, 0);
});
