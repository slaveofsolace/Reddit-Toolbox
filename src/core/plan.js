(() => {
  'use strict';

  const { Core } = globalThis.RedditToolbox;
  const PLAN_VERSION = 3;
  const reviewedBindings = new WeakMap();
  const RETRYABLE_STATUSES = new Set(['failed', 'stopped']);

  function fnv1a(value) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function executionOptions(options = {}) {
    return {
      accountId: String(options.accountId || '').trim(),
      deleteUneditablePosts: options.deleteUneditablePosts === true,
      verifyOverwrite: options.verifyOverwrite !== false,
      replacementLength: Math.max(8, Math.min(128, Math.trunc(Number(options.replacementLength) || 24))),
      continueOnFailure: options.continueOnFailure !== false,
      maxConsecutiveFailures: Math.max(
        1,
        Math.min(20, Math.trunc(Number(options.maxConsecutiveFailures) || 5))
      )
    };
  }

  function planDigest(items, options = {}) {
    return fnv1a(planBinding(items, options));
  }

  function planBinding(items, options = {}) {
    const normalized = executionOptions(options);
    return JSON.stringify({ options: normalized, targets: (items || []).map((item) => (
      [item.kind, item.fullname, item.editable !== false]
    )) });
  }

  function createPlan(items, options = {}, now = Date.now()) {
    const targets = Array.from(items || [], (item) => ({ ...item }));
    const normalizedOptions = executionOptions(options);
    const digest = planDigest(targets, normalizedOptions);
    const plan = {
      version: PLAN_VERSION,
      mode: 'automated-batch',
      id: `plan-${now}-${digest}`,
      createdAt: new Date(now).toISOString(),
      startedAt: null,
      finishedAt: null,
      status: 'ready',
      digest,
      confirmation: `DELETE ${targets.length} ${targets.length === 1 ? 'ITEM' : 'ITEMS'}`,
      options: normalizedOptions,
      retryOf: null,
      retryNumber: 0,
      items: targets.map((content, index) => ({
        id: `${digest}:${index}:${content.fullname}`,
        content,
        status: 'ready',
        phase: 'queued',
        attempts: 0,
        startedAt: null,
        finishedAt: null,
        outcome: null,
        error: null
      }))
    };
    reviewedBindings.set(plan, planBinding(targets, normalizedOptions));
    return plan;
  }

  function createRetryPlan(plan, now = Date.now()) {
    if (!plan?.items || !Array.isArray(plan.items)) return null;
    const targets = plan.items
      .filter((item) => RETRYABLE_STATUSES.has(item.status))
      .map((item) => item.content);
    if (!targets.length) return null;
    const retry = createPlan(targets, plan.options, now);
    retry.retryOf = plan.id;
    retry.retryNumber = Math.max(1, Number(plan.retryNumber || 0) + 1);
    return retry;
  }

  function isPlanCurrent(plan) {
    if (plan?.version !== PLAN_VERSION || plan?.mode !== 'automated-batch') return false;
    if (!plan?.items || !Array.isArray(plan.items)) return false;
    const binding = planBinding(plan.items.map((item) => item.content), plan.options);
    return reviewedBindings.get(plan) === binding && plan.digest === fnv1a(binding);
  }

  function lockPlan(plan) {
    if (!isPlanCurrent(plan)) throw new Error('The reviewed batch changed. Prepare it again.');
    Object.freeze(plan.options);
    for (const item of plan.items) {
      Object.freeze(item.content);
      Object.defineProperty(item, 'content', { writable: false, configurable: false });
    }
    Object.freeze(plan.items);
    for (const name of ['options', 'items', 'digest', 'confirmation']) {
      Object.defineProperty(plan, name, { writable: false, configurable: false });
    }
  }

  function planSummary(plan) {
    const summary = {
      total: plan?.items?.length || 0,
      ready: 0,
      processing: 0,
      completed: 0,
      skipped: 0,
      failed: 0,
      stopped: 0,
      processed: 0,
      remaining: 0,
      percent: 0
    };
    for (const item of plan?.items || []) {
      summary[item.status] = (summary[item.status] || 0) + 1;
    }
    summary.processed = summary.completed + summary.skipped + summary.failed;
    summary.remaining = summary.ready + summary.processing + summary.stopped;
    summary.percent = summary.total
      ? Math.min(100, Math.round((summary.processed / summary.total) * 100))
      : 0;
    return summary;
  }

  Core.PLAN_VERSION = PLAN_VERSION;
  Core.fnv1a = fnv1a;
  Core.executionOptions = executionOptions;
  Core.planDigest = planDigest;
  Core.createPlan = createPlan;
  Core.createRetryPlan = createRetryPlan;
  Core.isPlanCurrent = isPlanCurrent;
  Core.lockPlan = lockPlan;
  Core.planSummary = planSummary;
})();
