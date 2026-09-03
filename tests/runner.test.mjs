import test from 'node:test';
import assert from 'node:assert/strict';
import { loadToolbox } from './load-toolbox.mjs';

const { Core } = loadToolbox({
  files: [
    'src/core/namespace.js',
    'src/core/errors.js',
    'src/core/random.js',
    'src/core/plan.js',
    'src/core/runner.js'
  ]
});
const content = (id) => ({ fullname: `t1_${id}`, kind: 'comment', editable: true });

test('BatchRunner processes an entire reviewed batch sequentially', async () => {
  const calls = [];
  const events = [];
  let active = 0;
  let maximumActive = 0;
  const plan = Core.createPlan([content('a'), content('b'), content('c')], {});
  const runner = new Core.BatchRunner(async (item) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    calls.push(item.fullname);
    active -= 1;
    return { status: 'completed', reason: 'done' };
  }, {
    minimumDelayMs: 0,
    maximumDelayMs: 0,
    sleep: async () => {},
    onEvent: (event) => events.push(event.type)
  });

  const summary = await runner.run(plan);
  assert.deepEqual(calls, ['t1_a', 't1_b', 't1_c']);
  assert.equal(maximumActive, 1);
  assert.equal(summary.completed, 3);
  assert.equal(summary.percent, 100);
  assert.equal(events.filter((type) => type === 'batch-started').length, 1);
  assert.equal(events.filter((type) => type === 'batch-completed').length, 1);
});

test('BatchRunner retries temporary item failures automatically', async () => {
  let attempts = 0;
  const plan = Core.createPlan([content('a')], {});
  const runner = new Core.BatchRunner(async () => {
    attempts += 1;
    if (attempts === 1) throw new Core.ApiError('temporary', { retryable: true });
    return { status: 'completed', reason: 'done' };
  }, { sleep: async () => {}, maxRetries: 2 });

  const summary = await runner.run(plan);
  assert.equal(attempts, 2);
  assert.equal(summary.completed, 1);
});

test('BatchRunner waits through rate limits without another confirmation', async () => {
  let attempts = 0;
  const sleeps = [];
  const eventTypes = [];
  const plan = Core.createPlan([content('a')], {});
  const runner = new Core.BatchRunner(async () => {
    attempts += 1;
    if (attempts === 1) throw new Core.RateLimitError('slow down', 2_000);
    return { status: 'completed', reason: 'done' };
  }, {
    sleep: async (milliseconds) => sleeps.push(milliseconds),
    onEvent: (event) => eventTypes.push(event.type)
  });

  const summary = await runner.run(plan);
  assert.equal(attempts, 2);
  assert.equal(sleeps.reduce((sum, milliseconds) => sum + milliseconds, 0), 2_000);
  assert.equal(eventTypes.includes('batch-paused'), false);
  assert.equal(summary.completed, 1);
});

test('BatchRunner records an isolated permanent failure and continues', async () => {
  const calls = [];
  const plan = Core.createPlan([content('a'), content('b')], {});
  const runner = new Core.BatchRunner(async (item) => {
    calls.push(item.fullname);
    if (item.fullname === 't1_a') throw new Core.ApiError('nope', { code: 'NOPE' });
    return { status: 'completed', reason: 'done' };
  }, { minimumDelayMs: 0, maximumDelayMs: 0, sleep: async () => {} });

  const summary = await runner.run(plan);
  assert.deepEqual(calls, ['t1_a', 't1_b']);
  assert.equal(summary.failed, 1);
  assert.equal(summary.completed, 1);
});

test('BatchRunner pauses for account attention and resumes the same item', async () => {
  let attempts = 0;
  let runner;
  const plan = Core.createPlan([content('a')], {});
  runner = new Core.BatchRunner(async () => {
    attempts += 1;
    if (attempts === 1) throw new Core.PauseRequiredError('check Reddit');
    return { status: 'completed', reason: 'done' };
  }, {
    minimumDelayMs: 0,
    maximumDelayMs: 0,
    sleep: async () => {},
    onEvent: (event) => {
      if (event.type === 'attention-required') runner.resume();
    }
  });

  const summary = await runner.run(plan);
  assert.equal(attempts, 2);
  assert.equal(summary.completed, 1);
});

test('BatchRunner stops after the current item and creates one retry batch', async () => {
  let runner;
  const plan = Core.createPlan([content('a'), content('b')], {});
  runner = new Core.BatchRunner(async () => ({ status: 'completed', reason: 'done' }), {
    minimumDelayMs: 0,
    maximumDelayMs: 0,
    sleep: async () => {},
    onEvent: (event) => {
      if (event.type === 'item-finished' && event.index === 0) runner.stop();
    }
  });

  const summary = await runner.run(plan);
  const retry = Core.createRetryPlan(plan, 2_000);
  assert.equal(summary.completed, 1);
  assert.equal(summary.stopped, 1);
  assert.equal(summary.remaining, 1);
  assert.equal(retry.items.length, 1);
  assert.equal(retry.items[0].content.fullname, 't1_b');
});

test('BatchRunner stops before a long pacing delay begins', async () => {
  const plan = Core.createPlan([content('a'), content('b')], {});
  let runner;
  let sleepCalls = 0;
  runner = new Core.BatchRunner(async () => ({ status: 'completed', reason: 'done' }), {
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

test('BatchRunner pauses after the consecutive-failure guard', async () => {
  const plan = Core.createPlan([content('a'), content('b'), content('c')], {});
  let runner;
  let guarded = false;
  runner = new Core.BatchRunner(async () => {
    throw new Core.ApiError('blocked', { code: 'BLOCKED' });
  }, {
    minimumDelayMs: 0,
    maximumDelayMs: 0,
    maxConsecutiveFailures: 2,
    sleep: async () => {},
    onEvent: (event) => {
      if (event.type === 'failure-guard') {
        guarded = true;
        runner.stop();
      }
    }
  });

  const summary = await runner.run(plan);
  assert.equal(guarded, true);
  assert.equal(summary.failed, 2);
  assert.equal(summary.stopped, 1);
});

test('BatchRunner refuses a second browser-level cleanup lock', async () => {
  let workerCalled = false;
  const plan = Core.createPlan([content('a')], {});
  const runner = new Core.BatchRunner(async () => {
    workerCalled = true;
  }, {
    lockManager: {
      async request(_name, _options, callback) {
        return callback(null);
      }
    }
  });

  await assert.rejects(runner.run(plan), /another Reddit Toolbox batch/i);
  assert.equal(workerCalled, false);
});

test('ControlledRunner remains a compatible alias and accepts zero values', () => {
  const runner = new Core.ControlledRunner(async () => {}, {
    minimumDelayMs: 0,
    maximumDelayMs: 0,
    maxRetries: 0
  });
  assert.equal(Core.ControlledRunner, Core.BatchRunner);
  assert.equal(runner.minimumDelayMs, 0);
  assert.equal(runner.maximumDelayMs, 0);
  assert.equal(runner.maxRetries, 0);
});
