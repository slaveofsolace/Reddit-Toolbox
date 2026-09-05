import test from 'node:test';
import assert from 'node:assert/strict';
import { loadToolbox } from './load-toolbox.mjs';

const { Core } = loadToolbox();
const stamp = (value) => new Date(value).getTime();

const items = [
  { fullname: 't1_old', kind: 'comment', createdAt: stamp('2020-01-10T12:00:00Z'), subreddit: 'alpha', score: 1, text: 'first' },
  { fullname: 't3_mid', kind: 'post', createdAt: stamp('2022-06-15T12:00:00Z'), subreddit: 'beta', score: 50, title: 'middle' },
  { fullname: 't1_new', kind: 'comment', createdAt: stamp('2024-12-20T12:00:00Z'), subreddit: 'gamma', score: -2, text: 'last target' }
];

test('selectItems applies an inclusive date window', () => {
  const result = Core.selectItems(items, {
    dateMode: 'between',
    fromDate: '2022-01-01',
    throughDate: '2024-01-01'
  });
  assert.deepEqual(Array.from(result.selected, (item) => item.fullname), ['t3_mid']);
  assert.equal(result.skipped['before-range'], 1);
  assert.equal(result.skipped['after-range'], 1);
});

test('selectItems protects subreddits and high-score content', () => {
  const result = Core.selectItems(items, {
    keepSubreddits: 'r/alpha, other',
    keepScoreAtOrAbove: 10
  });
  assert.deepEqual(Array.from(result.selected, (item) => item.fullname), ['t1_new']);
  assert.equal(result.skipped['protected-subreddit'], 1);
  assert.equal(result.skipped['protected-score'], 1);
});

test('selectItems searches text, sorts, and caps the amount', () => {
  const result = Core.selectItems(items, {
    textIncludes: 'target',
    sortOrder: 'newest',
    maxItems: 1
  });
  assert.deepEqual(Array.from(result.selected, (item) => item.fullname), ['t1_new']);
  assert.equal(result.skipped['text-not-matched'], 2);
});

test('selectItems deduplicates fullnames', () => {
  const result = Core.selectItems([...items, { ...items[0] }], {});
  assert.equal(result.selected.length, 3);
});

test('dateRange rejects reversed windows', () => {
  assert.throws(() => Core.dateRange({
    dateMode: 'between',
    fromDate: '2025-01-01',
    throughDate: '2024-01-01'
  }), /starting date/i);
});

test('keep filters retain archive items with unknown protected fields', () => {
  const row = { fullname: 't1_test', kind: 'comment', createdAt: Date.now(), score: null, subreddit: '' };
  assert.equal(Core.evaluateItem(row, { keepScoreAtOrAbove: 10 }), 'unknown-score');
  assert.equal(Core.evaluateItem(row, { keepSubreddits: 'test' }), 'unknown-subreddit');
  assert.equal(Core.evaluateItem({ ...row, score: 0 }, { keepScoreAtOrAbove: 10 }), null);
});
