import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

export const phase = 6;
const config = createRequire(import.meta.url)('../../workbox-config.js');

test('API policy matches exact HTTPS origins and paths and never caches POSTs', () => {
  const api = config.runtimeCaching.find(rule => rule.handler === 'NetworkOnly');
  assert.ok(api);
  assert.equal(api.method, 'GET');
  const matches = address => api.urlPattern({ url: new URL(address) });
  for (const address of [
    'https://nfts.jessytremblay.com/STRX/stakes.json',
    'https://nfts.jessytremblay.com/STRX/newstakers.json',
    'https://proton.eosusa.io/v2/history/get_actions?account=bridge.strx',
    'https://api-v3.raydium.io/pools/info/ids?ids=fixture',
  ]) assert.equal(matches(address), true, address);
  for (const address of [
    'https://example.invalid/?api=https://nfts.jessytremblay.com/STRX/stakes.json',
    'https://nfts.jessytremblay.com.evil.invalid/STRX/stakes.json',
    'http://nfts.jessytremblay.com/STRX/stakes.json',
    'https://nfts.jessytremblay.com/STRX/stakes.json/extra',
    'https://api-v3.raydium.io/unrelated',
  ]) assert.equal(matches(address), false, address);
  for (const rule of config.runtimeCaching) {
    assert.equal(rule.method, 'GET');
    assert.notEqual(rule.options?.cacheName, 'api-cache');
  }
});

test('worker lifecycle retains full static offline coverage without forced activation', () => {
  assert.equal(config.clientsClaim, true);
  assert.equal(config.skipWaiting, false);
  assert.equal(config.navigateFallback, 'index.html');
  assert.ok(config.globPatterns.some(pattern => pattern.includes('html,js,css')));
  assert.ok(!config.globIgnores.some(pattern => /assets|UserPage|BridgePage|StakersChart/.test(pattern)));
});
