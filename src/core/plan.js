(() => {
  'use strict';

  const { Core } = globalThis.RedditToolbox;

  function fnv1a(value) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function planDigest(items, options = {}) {
    const settings = [
      options.deleteUneditablePosts === true ? 'direct-delete' : 'overwrite-only',
      options.verifyOverwrite !== false ? 'verify' : 'no-verify',
      Number(options.replacementLength) || 24
    ].join('|');
    const targets = (items || []).map((item) => (
      `${item.kind}:${item.fullname}:${item.editable === false ? 'direct' : 'editable'}`
    )).join('\n');
    return fnv1a(`${settings}\n${targets}`);
  }

  function createPlan(items, options = {}, now = Date.now()) {
    const targets = Array.from(items || []);
    const digest = planDigest(targets, options);
    return {
      id: `plan-${now}-${digest}`,
      createdAt: new Date(now).toISOString(),
      digest,
      confirmation: `DELETE ${targets.length} ${targets.length === 1 ? 'ITEM' : 'ITEMS'}`,
      options: {
        deleteUneditablePosts: options.deleteUneditablePosts === true,
        verifyOverwrite: options.verifyOverwrite !== false,
        replacementLength: Math.max(8, Math.min(128, Math.trunc(Number(options.replacementLength) || 24)))
      },
      items: targets.map((content, index) => ({
        id: `${digest}:${index}:${content.fullname}`,
        content,
        status: 'ready',
        attempts: 0,
        startedAt: null,
        finishedAt: null,
        outcome: null,
        error: null
      }))
    };
  }

  function isPlanCurrent(plan) {
    if (!plan?.items || !Array.isArray(plan.items)) return false;
    return plan.digest === planDigest(plan.items.map((item) => item.content), plan.options);
  }

  function planSummary(plan) {
    const summary = {
      total: plan?.items?.length || 0,
      ready: 0,
      processing: 0,
      completed: 0,
      skipped: 0,
      failed: 0,
      stopped: 0
    };
    for (const item of plan?.items || []) {
      summary[item.status] = (summary[item.status] || 0) + 1;
    }
    return summary;
  }

  Core.fnv1a = fnv1a;
  Core.planDigest = planDigest;
  Core.createPlan = createPlan;
  Core.isPlanCurrent = isPlanCurrent;
  Core.planSummary = planSummary;
})();
