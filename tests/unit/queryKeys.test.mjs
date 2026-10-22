import test from 'node:test';
import assert from 'node:assert/strict';
import * as keys from '../../src/lib/queryKeys.ts';
export const phase = 3;
test('canonical keys encode endpoint, account and bridge cursor without collisions', () => {
  const shared = [keys.snapshotKey(), keys.configKey('a'), keys.oraclePricesKey('a'), keys.rewardsPoolKey('a'), keys.bridgeBalanceKey('a'), keys.raydiumKey(), keys.dexPairsKey(), keys.xsolKey(), keys.newStakersKey()];
  assert.equal(new Set(shared).size, 9);
  for (const key of shared) assert.equal(keys.isPersistableSharedKey(key), true);
  assert.notEqual(keys.configKey('a'), keys.configKey('b'));
  assert.notEqual(keys.userActionsKey('a', 'jack'), keys.userActionsKey('a', 'jill'));
  assert.notEqual(keys.userBalanceKey('a', 'jack'), keys.userActionsKey('a', 'jack'));
  assert.notEqual(keys.bridgeHistoryKey('a', null, 0, 300), keys.bridgeHistoryKey('a', null, 300, 300));
  for (const key of [keys.recentActionsKey('a'), keys.userActionsKey('a', 'jack'), keys.userBalanceKey('a', 'jack'), keys.bridgeHistoryKey('a', null, 0, 300), 'swr-cache', null, '{}', '["strxldr:v3","config"]', '["strxldr:v3","snapshot","extra"]', '["strxldr:v3","config",""]', '["strxldr:v2","snapshot"]']) assert.equal(keys.isPersistableSharedKey(key), false);
});
