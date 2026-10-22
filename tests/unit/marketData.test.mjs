import test from 'node:test';
import assert from 'node:assert/strict';
import { getRaydiumStats, formatOptionalNumber } from '../../src/lib/marketData.ts';
export const phase = 2;
test('unavailable envelopes and partial periods never invent numbers', () => {
  for (const response of [undefined, null, {}, [], {
    success: false,
    data: [{
      price: 1
    }]
  }, {
    success: true,
    data: []
  }]) assert.ok(Object.values(getRaydiumStats(response)).every(v => v === null));
  const partial = getRaydiumStats({
    success: true,
    data: [{
      price: 0,
      day: {
        apr: 0,
        rewardApr: [],
        volume: Infinity
      },
      tvl: NaN
    }]
  });
  assert.equal(partial.price, 0);
  assert.equal(partial.apr, 0);
  assert.equal(partial.rewardApr, null);
  assert.equal(partial.dayVolume, null);
  assert.equal(partial.weekVolume, null);
  assert.equal(formatOptionalNumber(0, 2), '0.00');
  assert.equal(formatOptionalNumber(Infinity, 2), 'N/A');
  assert.equal(formatOptionalNumber(null), 'N/A');
});
