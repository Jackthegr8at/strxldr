import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startAuditServer } from '../../scripts/serve-audit-build.mjs';
import { installApiFixtures } from '../fixtures/api.mjs';
export const phase = 3;
test('corrupt preferences and denied storage cannot prevent dashboard startup', async () => {
  const server = await startAuditServer();
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--disable-background-networking', `--log-file=${path.resolve('plan/audit-evidence/phase3-chromium.log')}`]
    });
    for (const mode of ['invalid-json', 'missing-boolean', 'wrong-version', 'blocked']) {
      const context = await browser.newContext({
        serviceWorkers: 'block'
      });
      try {
        await context.addInitScript(mode => {
          delete Navigator.prototype.serviceWorker;
          if (mode === 'blocked') Object.defineProperty(window, 'localStorage', {
            get() {
              throw new DOMException('Denied', 'SecurityError');
            }
          });else localStorage.setItem('sectionVisibility', mode === 'invalid-json' ? '{' : mode === 'missing-boolean' ? JSON.stringify({
            recentActivity: false
          }) : JSON.stringify({
            version: 99,
            value: {
              recentActivity: false,
              newStakers: false,
              tierMilestones: false
            }
          }));
        }, mode);
        const fixtures = await installApiFixtures(context, {
          origin: server.origin
        });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        page.setDefaultTimeout(7000);
        await page.goto(server.origin);
        await page.getByText('Reward APR:', {
          exact: false
        }).waitFor();
        assert.deepEqual(errors, []);
        assert.deepEqual(fixtures.blocked, []);
        assert.doesNotMatch(await page.locator('body').innerText(), /Something went wrong/);
        if (mode !== 'blocked') assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('sectionVisibility'))), {
          version: 1,
          value: {
            recentActivity: true,
            newStakers: true,
            tierMilestones: true
          }
        });
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser?.close();
    await server.close();
  }
});
test('trusted aliases preserve snapshot principal across warm reload using canonical-only storage', async () => {
  const server = await startAuditServer();
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--disable-background-networking', `--log-file=${path.resolve('plan/audit-evidence/phase3-chromium.log')}`]
    });
    const context = await browser.newContext({
      serviceWorkers: 'block'
    });
    await context.addInitScript(() => {
      delete Navigator.prototype.serviceWorker;
    });
    const options = {
      origin: server.origin
    };
    const fixtures = await installApiFixtures(context, options);
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' && /ErrorBoundary|React error|An error occurred/.test(message.text())) errors.push(message.text());
    });
    await page.goto(server.origin + '/?user=audituser');
    await page.getByPlaceholder('Staked amount').waitFor();
    assert.equal(await page.getByPlaceholder('Staked amount').inputValue(), '1000000');
    const envelope = await page.evaluate(() => {
      dispatchEvent(new Event('pagehide'));
      return JSON.parse(localStorage.getItem('strxldr:swr-cache:v3'));
    });
    assert.equal(envelope.version, 3);
    assert.ok(envelope.entries.length > 0);
    for (const [key] of envelope.entries) assert.equal(JSON.parse(key)[0], 'strxldr:v3');
    const cachedSnapshot = envelope.entries.find(([key]) => JSON.parse(key)[1] === 'snapshot');
    assert.equal(cachedSnapshot[1].data.data.audituser.staked, 1000000);
    options.fail = 'snapshot';
    const failedSnapshot = page.waitForResponse(response => response.url().includes('/STRX/stakes.json') && response.status() === 503);
    await page.reload();
    await failedSnapshot;
    await page.getByPlaceholder('Staked amount').waitFor();
    assert.equal(await page.getByPlaceholder('Staked amount').inputValue(), '1000000');
    assert.deepEqual(fixtures.blocked, []);
    assert.deepEqual(errors, []);
    assert.doesNotMatch(await page.locator('body').innerText(), /Something went wrong/);
    await context.close();
  } finally {
    await browser?.close();
    await server.close();
  }
});
