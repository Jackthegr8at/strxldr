import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileStake, calculateScenarioRewards, projectStake, findDaysToTarget } from '../../src/lib/stakingMath.ts';
export const phase = 2;
test('snapshot replacement, exact cutoff, UTC normalization and claims', () => {
  const a = [{
    timestamp: '2026-10-20T00:00:00Z',
    amount: 50,
    type: 'add stake'
  }, {
    timestamp: '2026-10-21T00:00:00Z',
    amount: 100,
    type: 'add stake'
  }, {
    timestamp: '2026-10-21T00:00:01',
    amount: 20,
    type: 'withdraw stake'
  }, {
    timestamp: '2026-10-21T00:00:02Z',
    amount: 999,
    type: 'claim staking rewards'
  }];
  assert.equal(reconcileStake(0, a, '2026-10-20T00:00:00Z'), 80);
  assert.equal(reconcileStake(32000000, [], '2026-10-20T00:00:00Z'), 32000000);
  assert.equal(reconcileStake(2000000, a, '2026-10-22T00:00:00Z'), 2000000);
  for (const cutoff of [null, 'bad']) assert.equal(reconcileStake(10, a, cutoff), 10);
  assert.equal(reconcileStake(0, [a[2]], '2026-10-20T00:00:00Z'), 0);
});
test('direct rewards, zero and nonfinite inputs', () => {
  assert.ok(Math.abs(calculateScenarioRewards(2000000, 1, 257600000, .001).daily - 670.8074534161491) < 1e-9);
  assert.equal(calculateScenarioRewards(0, 1, 257600000, 0).daily, 0);
  for (const args of [[1, 1, 0, 1], [NaN, 1, 1, 1], [1, Infinity, 1, 1], [1, 1, 1, NaN], [1e308, 1e308, 1, 1]]) assert.equal(calculateScenarioRewards(...args), null);
});
test('projection conventions, zero target day and horizon', () => {
  for (const strategy of ['noCompound', 'dailyCompound', 'monthlyCompound', 'annualCompound']) {
    assert.equal(projectStake(0, 0, 365, 12, strategy), 0);
    assert.equal(findDaysToTarget(100, 0, 100, strategy), 0);
    assert.equal(findDaysToTarget(100, 0, 101, strategy), null);
  }
  assert.equal(projectStake(100, .01, 30, 1, 'noCompound'), 130);
  assert.equal(projectStake(100, .01, 30, 1, 'monthlyCompound'), 130);
  assert.ok(Math.abs(projectStake(100, .01, 365, 12, 'annualCompound') - 465) < 1e-10);
  assert.equal(projectStake(100, Infinity, 1, 0, 'dailyCompound'), null);
  assert.equal(projectStake(1e308, 1e308, 365, 12, 'dailyCompound'), null);
});
test('invalid action timestamps and negative amounts are ignored; horizon zero is exact', () => {
  const actions = [{
    timestamp: 'bad',
    amount: 100,
    type: 'add stake'
  }, {
    timestamp: '2026-10-21T00:00:00Z',
    amount: -100,
    type: 'withdraw stake'
  }];
  assert.equal(reconcileStake(42, actions, '2026-10-20T00:00:00Z'), 42);
  assert.equal(findDaysToTarget(100, 1, 101, 'dailyCompound', new Date('2026-10-21T00:00:00Z'), 0), null);
  assert.equal(findDaysToTarget(100, 1, 100, 'dailyCompound', new Date('2026-10-21T00:00:00Z'), 0), 0);
});
