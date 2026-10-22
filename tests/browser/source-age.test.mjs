import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startAuditServer } from '../../scripts/serve-audit-build.mjs';
import { installApiFixtures } from '../fixtures/api.mjs';

export const phase = 3;

test('missing snapshot source time stays unknown and cannot reconcile profile actions', async () => {
  const server = await startAuditServer();
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: [
        '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
        '--disable-background-networking',
        `--log-file=${path.resolve('plan/audit-evidence/phase3-source-age-chromium.log')}`
      ]
    });
    const context = await browser.newContext({ serviceWorkers: 'block', locale: 'en-US' });
    await context.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
    const fixture = await installApiFixtures(context, {
      origin: server.origin,
      missingLastModified: true,
      userActions: {
        audituser: [{
          timestamp: '2026-10-21T00:00:00Z',
          trx_id: 'unknown-cutoff-fixture',
          act: { data: { memo: 'add stake', quantity: '1000000 STRX' } }
        }]
      }
    });
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    page.setDefaultNavigationTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' && /ErrorBoundary|React error|An error occurred/.test(message.text())) errors.push(message.text());
    });
    await page.goto(server.origin);
    await page.getByText('Source update time unavailable', { exact: true }).waitFor();
    assert.equal(await page.getByText(/Last updated/).count(), 0);

    await page.goto(server.origin + '/?user=audituser');
    await page.getByRole('heading', { name: "audituser's Staking Profile" }).waitFor();
    // Ensure the post-snapshot action actually arrived and rendered before checking principal.
    await page.getByRole('cell', { name: '1000000.0000 STRX', exact: true }).waitFor();
    const stakedCard = page.getByText('Total Staked', { exact: true }).locator('..');
    assert.match(await stakedCard.innerText(), /1,000,000 STRX/);
    assert.equal(await page.getByPlaceholder('Staked amount').inputValue(), '1000000');
    await page.getByText('335.4037 STRX', { exact: true }).waitFor();
    assert.doesNotMatch(await page.locator('body').innerText(), /NaN|Infinity|Invalid Date/);
    assert.deepEqual(errors, []);
    assert.deepEqual(fixture.blocked, []);
    await context.close();
  } finally {
    await browser?.close();
    await server.close();
  }
});
