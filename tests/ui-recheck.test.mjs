import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceOrder } from '../scripts/source-order.mjs';
import { loadToolbox } from './load-toolbox.mjs';

function setup() {
  const { Core, UI } = loadToolbox({ files: sourceOrder.filter(file => file !== 'src/main.js') });
  const app = new UI.RedditToolboxApp({ store: { get: (_key, fallback) => fallback } });
  app.plan = Core.createPlan(['t1_done', 't1_waiting'].map(fullname => ({ fullname, kind: 'comment', editable: true })), { accountId: 'owner' });
  app.plan.items[0].status = 'unconfirmed';
  app.plan.items[1].status = 'stopped';
  app.plan.status = 'stopped';
  app.runner = { state: 'stopped' };
  app.refs.currentAction = { textContent: '' };
  app.refs.runStatus = { textContent: '' };
  app.refreshControls = app.updateQueueRow = app.updateBatchMetrics = app.renderCounts = app.log = () => {};
  app.setStatus = (el, text) => { el.textContent = text; };
  app.setLauncherState = state => { app.launcherState = state; };
  return { Core, app };
}

test('rechecking a stopped batch can confirm results without marking untouched items complete', async () => {
  const { app } = setup();
  const visited = [];
  app.removalService = {
    stateFor: () => ({}),
    verifyDeleted: async (item, _state, _context, resend) => {
      assert.equal(resend, false);
      visited.push(item.fullname);
    }
  };
  await app.recheckResults();
  assert.deepEqual(visited, ['t1_done']);
  assert.deepEqual(app.plan.items.map(item => item.status), ['completed', 'stopped']);
  assert.equal(app.plan.status, 'stopped');
  assert.equal(app.runner.state, 'stopped');
  assert.equal(app.launcherState, 'stopped');
  assert.match(app.refs.runStatus.textContent, /1 deleted; 0 need recheck; 1 remaining items stopped/);
});

test('cancelling a rate-limited recheck leaves unresolved and untouched items unchanged', async () => {
  const { Core, app } = setup();
  let reads = 0;
  app.removalService = {
    stateFor: () => ({}),
    verifyDeleted: async () => { reads++; throw new Core.RateLimitError('Cooldown', 500000); }
  };
  Core.wait = async () => { app.stopRun(); };
  await app.recheckResults();
  assert.equal(reads, 1);
  assert.deepEqual(app.plan.items.map(item => item.status), ['unconfirmed', 'stopped']);
  assert.equal(app.plan.items[0].error, null);
  assert.equal(app.refs.currentAction.textContent, 'Recheck stopped.');
  assert.equal(app.busy, false);
  assert.equal(app.rechecking, false);
});
