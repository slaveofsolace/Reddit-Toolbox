import test from 'node:test';
import assert from 'node:assert/strict';
import { loadToolbox } from './load-toolbox.mjs';
import { virtualPacer } from './virtual-pacer.mjs';

function setup(options = {}) {
  const { Core, Reddit } = loadToolbox();
  let sent = 0;
  let reads = 0;
  let replacement;
  const item = { fullname: 't1_target', kind: 'comment', editable: true };
  const client = {
    username: 'owner',
    assertSession: async () => ({ username: 'owner' }),
    inspectTarget: async () => ({ available: true, owned: true, editable: true }),
    edit: async (_id, text) => { replacement = text; },
    verifyText: async () => true,
    delete: async () => { sent++; if (options.lost) throw new Core.ApiError('Lost', { code: 'NETWORK_ERROR' }); },
    isDeleted: async () => false,
    getDeletionStatus: async () => { reads++; return options.status?.({ sent, reads, replacement }) || { status: 'missing' }; }
  };
  const service = new Reddit.RedditRemovalService(client, { expectedUsername: 'owner', sleep: async () => {}, deletionVerificationAttempts: 3 });
  return { Core, Reddit, client, item, service, sent: () => sent, reads: () => reads };
}

test('accepted deletion followed by two valid missing-item reads completes without a tombstone', async () => {
  const f = setup();
  assert.equal((await f.service.remove(f.item)).deleted, true);
  assert.equal(f.sent(), 1);
  assert.equal(f.reads(), 2);
  assert.equal(f.service.stateFor(f.item.fullname).deletionEvidence, 'accepted-and-no-longer-returned');
});

test('absence never confirms a lost delete response and rechecking never resends it', async () => {
  const f = setup({ lost: true });
  await assert.rejects(f.service.remove(f.item), { code: 'DELETE_RESULT_UNCERTAIN' });
  await assert.rejects(f.service.verifyDeleted(f.item, f.service.stateFor(f.item.fullname), {}, false), { code: 'DELETE_RESULT_UNCERTAIN' });
  assert.equal(f.sent(), 1);
});

test('a read-only recheck validates the account before interpreting absent results', async () => {
  const f = setup({ lost: true });
  await assert.rejects(f.service.remove(f.item), { code: 'DELETE_RESULT_UNCERTAIN' });
  const reads = f.reads();
  f.client.assertSession = async () => { throw new f.Core.AuthError('Account changed'); };
  await assert.rejects(f.service.verifyDeleted(f.item, f.service.stateFor(f.item.fullname), {}, false), /Account changed/);
  assert.equal(f.reads(), reads);
  assert.equal(f.sent(), 1);
  assert.equal(f.service.stateFor(f.item.fullname).completed, undefined);
});

test('one missing response followed by a visible item is not deletion evidence', async () => {
  const f = setup({ status: ({ reads }) => ({ status: reads === 1 ? 'missing' : 'unknown' }) });
  await assert.rejects(f.service.remove(f.item), { code: 'DELETE_RESULT_UNCERTAIN' });
  assert.equal(f.sent(), 1);
});

test('a successful no-op is retried once after repeated exact owned-text verification', async () => {
  const f = setup({ status: ({ sent, replacement }) => sent === 1 ? { status: 'present', owned: true, editable: true, text: replacement } : { status: 'deleted' } });
  assert.equal((await f.service.remove(f.item)).deleted, true);
  assert.equal(f.sent(), 2);
});

test('delete retries are bounded and never target changed ownership or text', async () => {
  for (const variant of ['same', 'owner', 'text']) {
    const f = setup({ status: ({ replacement }) => ({ status: 'present', owned: variant !== 'owner', editable: true, text: variant === 'text' ? 'changed' : replacement }) });
    await assert.rejects(f.service.remove(f.item), { code: 'DELETE_RESULT_UNCERTAIN' });
    assert.equal(f.sent(), variant === 'same' ? 2 : 1);
    await assert.rejects(f.service.verifyDeleted(f.item, f.service.stateFor(f.item.fullname), {}, false), { code: 'DELETE_RESULT_UNCERTAIN' });
    assert.equal(f.sent(), variant === 'same' ? 2 : 1);
  }
});

test('an uncertain item is counted separately and does not block the next reviewed item', async () => {
  const f = setup();
  const plan = f.Core.createPlan([f.item, { ...f.item, fullname: 't1_second' }], { accountId: 'owner' });
  const visits=[];
  const runner=new f.Core.BatchRunner(async item => {
    visits.push(item.fullname);
    if(item.fullname==='t1_target')throw new f.Core.ApiError('Pending', { code:'DELETE_RESULT_UNCERTAIN' });
    return { status:'completed', deleted:true };
  }, { minimumDelayMs:0,maximumDelayMs:0 });
  const result=await runner.run(plan);
  assert.deepEqual(visits,['t1_target','t1_second']);
  assert.equal(result.completed,1);
  assert.equal(result.unconfirmed,1);
  assert.equal(result.failed,0);
  assert.equal(result.processed,2);
  assert.equal(result.remaining,0);
  assert.equal(f.Core.createRetryPlan(plan),null);
});

test('null authors and explicit deletion metadata are recognized without accepting moderation removal', async () => {
  const { Reddit }=loadToolbox();
  let data;
  const client=new Reddit.RedditSessionClient({ pacer: virtualPacer(Reddit), fetchImpl: async()=>new Response(JSON.stringify({data:{children:[{kind:'t1',data}]}}),{headers:{'content-type':'application/json'}}) });
  data={name:'t1_target',author:null,body:'[deleted]'};
  assert.equal(await client.isDeleted('t1_target'),true);
  data={name:'t1_target',author:'[deleted]',body:'[removed]'};
  assert.equal(await client.isDeleted('t1_target'),false);
  data.removed_by_category='deleted';
  assert.equal(await client.isDeleted('t1_target'),true);
  data={name:'t1_target',body:''};
  assert.equal(await client.isDeleted('t1_target'),false);
});

test('HTTP 200 rejection envelopes are not accepted as successful mutations', async () => {
  const { Reddit }=loadToolbox();
  for (const [payload,code] of [[{success:false},'REDDIT_REJECTED'],[{error:403},'REDDIT_FORBIDDEN']]) {
    const client=new Reddit.RedditSessionClient({ pacer: virtualPacer(Reddit),modhash:'fixture-only',fetchImpl:async()=>new Response(JSON.stringify(payload),{headers:{'content-type':'application/json'}})});
    await assert.rejects(client.delete('t1_target'),{code});
  }
});

test('accepted owned-comment deletion confirms the live deleted-author/removed-body response', async () => {
  const f = setup({ status: () => ({ status: 'present', authorDeleted: true, owned: false, text: '[removed]' }) });
  assert.equal((await f.service.remove(f.item)).deleted, true);
  assert.equal(f.reads(), 1);
  assert.equal(f.sent(), 1);
  assert.equal(f.service.stateFor(f.item.fullname).deletionEvidence, 'accepted-and-author-deleted');
});

test('a removed body still does not confirm an active author, unacknowledged request, or unverified ownership', async () => {
  for (const variant of ['author', 'lost', 'ownership']) {
    const f = setup({ lost: variant === 'lost', status: () => ({ status: 'present', authorDeleted: variant !== 'author', owned: false, text: '[removed]' }) });
    if (variant === 'ownership') {
      const state = f.service.stateFor(f.item.fullname);
      state.deleteSent = true; state.deleteAcknowledged = true;
    }
    await assert.rejects(f.service.remove(f.item), { code: 'DELETE_RESULT_UNCERTAIN' });
    assert.equal(f.sent(), variant === 'ownership' ? 0 : 1);
  }
});
