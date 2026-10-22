import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startAuditServer } from '../../scripts/serve-audit-build.mjs';
import { installApiFixtures, snapshot, sourceTime } from '../fixtures/api.mjs';
export const phase = 5;
const CACHE_KEY = 'strxldr:swr-cache:v3';
const initialTime = Date.parse('2026-10-21T12:00:00Z');
const isSnapshot = response => response.url().includes('/STRX/stakes.json');
async function scenario(run) {
  const server = await startAuditServer({ port: 4175 });
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--disable-background-networking', `--log-file=${path.resolve('plan/audit-evidence/phase5-freshness-chromium.log')}`] });
    const context = await browser.newContext({ serviceWorkers: 'block', locale: 'en-US' });
    await context.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
    const options = { origin: server.origin };
    const fixtures = await installApiFixtures(context, options);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(10000);
    await page.clock.install({ time: new Date(initialTime) });
    await run({ page, options, fixtures, origin: server.origin });
    assert.deepEqual(errors, []);
    assert.deepEqual(fixtures.blocked, []);
    await context.close();
  } finally { await browser?.close(); await server.close(); }
}
async function flushSnapshot(page, resource = 'snapshot') {
  return page.evaluate(({ cacheKey, resource }) => {
    dispatchEvent(new Event('pagehide'));
    const envelope = JSON.parse(localStorage.getItem(cacheKey));
    if (envelope?.version !== 3) throw new Error('Missing canonical cache envelope');
    if (envelope.entries.some(([key]) => JSON.parse(key)[0] !== 'strxldr:v3')) throw new Error('Noncanonical persisted key');
    return envelope.entries.find(([key]) => JSON.parse(key)[1] === resource)?.[1];
  }, { cacheKey: CACHE_KEY, resource });
}
async function loadProfile(page, origin) {
  await page.goto(origin + '/?user=audituser');
  await page.getByPlaceholder('Staked amount').waitFor();
  assert.equal(await page.getByPlaceholder('Staked amount').inputValue(), '1000000');
  const cached = await flushSnapshot(page);
  assert.ok(cached, 'successful snapshot is persisted under a canonical key');
  assert.equal(cached.data.data.audituser.staked, 1000000);
  assert.equal(cached.data.lastModified, new Date(sourceTime).toISOString());
  return cached;
}
async function reloadWithFailure(page, options) {
  options.fail = 'snapshot';
  const failed = page.waitForResponse(response => isSnapshot(response) && response.status() === 503);
  await page.reload(); await failed;
  await page.getByText('Showing cached data. The latest refresh failed.', { exact: true }).waitFor();
  assert.equal(await page.getByPlaceholder('Staked amount').inputValue(), '1000000');
}
async function retrySuccess(page, options) {
  options.fail = undefined;
  const success = page.waitForResponse(response => isSnapshot(response) && response.status() === 200);
  await page.getByRole('button', { name: 'Retry', exact: true }).click(); await success;
  await page.getByText(/Showing cached data/).waitFor({ state: 'detached' });
}
test('canonical shared resources restore original fetchedAt and visibly label cached data after failure', async () => {
  await scenario(async ({ page, options, origin }) => {
    const original = await loadProfile(page, origin);
    await page.clock.setSystemTime(new Date(initialTime + 60000));
    await reloadWithFailure(page, options);
    const restored = await flushSnapshot(page);
    assert.equal(restored.fetchedAt, original.fetchedAt, 'failed revalidation and pagehide cannot renew freshness');
    assert.equal(restored.data.lastModified, original.data.lastModified);
    assert.equal(await page.getByRole('button', { name: 'Retry', exact: true }).count(), 1);
  });
});
test('first successful revalidation replaces persisted 1M with 2M while preserving source age', async () => {
  await scenario(async ({ page, options, origin }) => {
    const original = await loadProfile(page, origin);
    await page.clock.setSystemTime(new Date(initialTime + 60000));
    await reloadWithFailure(page, options);
    options.snapshot = { ...snapshot, audituser: { ...snapshot.audituser, staked: 2000000 } };
    await retrySuccess(page, options);
    await page.waitForFunction(() => document.querySelector('input[placeholder="Staked amount"]')?.value === '2000000');
    const renewed = await flushSnapshot(page);
    assert.equal(renewed.data.data.audituser.staked, 2000000);
    assert.ok(renewed.fetchedAt > original.fetchedAt);
    assert.equal(renewed.data.lastModified, original.data.lastModified, 'retrieval time cannot replace source publication time');
  });
});
test('identical successful payload renews freshness subscribers and clears cached status', async () => {
  await scenario(async ({ page, options, origin }) => {
    // Balance responses have no fetchedAt field, so SWR sees an identical value.
    // This specifically exercises freshness subscribers even without a data change.
    await page.goto(origin + '/bridge');
    await page.getByText('1,000,000 STRX', { exact: true }).waitFor();
    const original = await flushSnapshot(page, 'bridgeBalance');
    assert.deepEqual(original.data, ['1000000.0000 STRX']);
    await page.clock.setSystemTime(new Date(initialTime + 60000));
    options.fail = 'balance';
    const failed = page.waitForResponse(response => response.url().includes('/v1/chain/get_currency_balance') && response.status() === 503);
    await page.reload(); await failed;
    await page.getByText('Showing cached data. The latest refresh failed.', { exact: true }).waitFor();
    options.fail = undefined;
    const success = page.waitForResponse(response => response.url().includes('/v1/chain/get_currency_balance') && response.status() === 200);
    await page.getByRole('button', { name: 'Retry', exact: true }).click(); await success;
    await page.getByText(/Showing cached data/).waitFor({ state: 'detached' });
    const renewed = await flushSnapshot(page, 'bridgeBalance');
    assert.deepEqual(renewed.data, original.data);
    assert.ok(renewed.fetchedAt > original.fetchedAt, 'identical resource value still records successful retrieval');
  });
});
test('ten-minute-old shared snapshot expires despite pagehide and yields explicit recoverable error', async () => {
  await scenario(async ({ page, options, origin }) => {
    const original = await loadProfile(page, origin);
    // Move Date only: no scheduled poll may renew the record before closing.
    await page.clock.setSystemTime(new Date(initialTime + 600000));
    assert.equal((await flushSnapshot(page)).fetchedAt, original.fetchedAt);
    options.fail = 'snapshot';
    const failed = page.waitForResponse(response => isSnapshot(response) && response.status() === 503);
    await page.reload(); await failed;
    await page.getByRole('alert').filter({ hasText: 'Unable to load data. Please try again.' }).waitFor();
    assert.equal(await page.getByPlaceholder('Staked amount').count(), 0, 'expired snapshot cannot create a profile or invented zero stake');
    assert.equal(await page.getByText(/Showing cached data/).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Retry', exact: true }).isEnabled(), true);
    assert.equal(await flushSnapshot(page), undefined, 'expired snapshot is excluded from restored persistence');
    await retrySuccess(page, options);
    await page.getByPlaceholder('Staked amount').waitFor();
    assert.equal(await page.getByPlaceholder('Staked amount').inputValue(), '1000000');
  });
});
