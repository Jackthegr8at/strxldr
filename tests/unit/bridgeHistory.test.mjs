import test from 'node:test';
import assert from 'node:assert/strict';
import { actionIdentity, mergePages, filterActions, isExhausted, pageCount } from '../../src/lib/bridgeHistory.ts';
import { bridgeActions } from '../fixtures/api.mjs';
export const phase = 4;
test('raw exhaustion ignores sparse matches and duplicate refreshes', () => {
  const full = bridgeActions.slice(0, 300);
  assert.equal(filterActions(full, 'audituser').length, 0);
  assert.equal(isExhausted(full), false);
  const pages = new Map([[0, full], [300, bridgeActions.slice(300, 600)]]);
  assert.equal(filterActions(mergePages(pages), 'audituser')[0].trx_id, 'synthetic-350');
  assert.equal(mergePages(new Map([[0, full], [300, full]])).length, 300);
  assert.equal(isExhausted(bridgeActions.slice(600)), true);
  assert.equal(pageCount(0), 1);
  assert.deepEqual(mergePages(new Map()), []);
});
test('distinct sequences and fallback action composites preserve one transaction actions', () => {
  const a = bridgeActions[350],
    b = {
      ...a,
      global_sequence: 'another'
    };
  assert.equal(mergePages(new Map([[0, [a, b]]])).length, 2);
  const c = {
      ...a,
      global_sequence: undefined
    },
    d = {
      ...c,
      act: {
        ...c.act,
        data: {
          ...c.act.data,
          quantity: '20 STRX'
        }
      }
    };
  assert.notEqual(actionIdentity(c), actionIdentity(d));
});
