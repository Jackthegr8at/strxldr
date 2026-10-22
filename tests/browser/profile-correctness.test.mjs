import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startAuditServer } from '../../scripts/serve-audit-build.mjs';
import { installApiFixtures, snapshot, config } from '../fixtures/api.mjs';
export const phase = 2;
const launch = () => chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--disable-background-networking', `--log-file=${path.resolve('plan/audit-evidence/phase2-chromium.log')}`]
});
const metric = (page, label) => page.getByText(label, {
  exact: true
}).locator('..');
async function select(page, user) {
  await page.evaluate(user => {
    history.pushState({}, '', `?user=${user}`);
    dispatchEvent(new PopStateEvent('popstate'));
  }, user);
  await page.getByRole('heading', {
    name: `${user}'s Staking Profile`
  }).waitFor();
}
async function finiteBody(page) {
  assert.doesNotMatch(await page.locator('body').innerText(), /NaN|Infinity|Invalid Date/);
}
test('profile identity, immediate simulation, zero principal and Back/Forward', async () => {
  const server = await startAuditServer();
  let browser;
  try {
    browser = await launch();
    const context = await browser.newContext({
      serviceWorkers: 'block',
      locale: 'en-US'
    });
    await context.addInitScript(() => {
      delete Navigator.prototype.serviceWorker;
    });
    const fixtures = await installApiFixtures(context, {
      origin: server.origin
    });
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    page.setDefaultNavigationTimeout(10000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => {
      if (m.type() === 'error' && /ErrorBoundary|React error|An error occurred/.test(m.text())) errors.push(m.text());
    });
    await page.goto(server.origin + '/?user=audituser');
    await page.getByPlaceholder('Staked amount').waitFor();
    assert.equal(await page.getByPlaceholder('Staked amount').inputValue(), '1000000');
    assert.match(await metric(page, 'Total Staked').innerText(), /1,000,000 STRX/);
    await page.getByPlaceholder('Staked amount').fill('2000000');
    assert.equal(await page.getByPlaceholder('Staked amount').inputValue(), '2000000');
    await page.getByText(/335\.4037 STRX/).first().waitFor(); // Difference equals one million stake, without double scaling.
    await select(page, 'nextuser');
    assert.equal(await page.getByPlaceholder('Staked amount').inputValue(), '32000000');
    assert.match(await metric(page, 'Total Staked').innerText(), /32,000,000 STRX/);
    await select(page, 'zerostaker');
    assert.equal(await page.getByPlaceholder('Staked amount').inputValue(), '0');
    assert.match(await metric(page, 'Total Staked').innerText(), /0 STRX/);
    await finiteBody(page);
    await page.goBack();
    await page.getByRole('heading', {
      name: "nextuser's Staking Profile"
    }).waitFor();
    assert.equal(await page.getByPlaceholder('Staked amount').inputValue(), '32000000');
    await page.goForward();
    await page.getByRole('heading', {
      name: "zerostaker's Staking Profile"
    }).waitFor();
    await finiteBody(page);
    assert.deepEqual(errors, []);
    assert.deepEqual(fixtures.blocked, []);
    await context.close();
  } finally {
    await browser?.close();
    await server.close();
  }
});
test('new snapshots update unedited simulation while preserving edited simulation', async () => {
  const server = await startAuditServer();
  let browser;
  try {
    browser = await launch();
    const context = await browser.newContext({
      serviceWorkers: 'block',
      locale: 'en-US'
    });
    await context.addInitScript(() => {
      delete Navigator.prototype.serviceWorker;
    });
    const options = {
      origin: server.origin,
      snapshot: structuredClone(snapshot)
    };
    const fixtures = await installApiFixtures(context, options);
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    page.setDefaultNavigationTimeout(10000);
    await page.clock.install();
    await page.goto(server.origin + '/?user=audituser');
    await page.getByPlaceholder('Staked amount').waitFor();
    options.snapshot.audituser.staked = 2000000;
    await page.clock.fastForward(121000);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForFunction(() => document.querySelector('input[placeholder="Staked amount"]')?.value === '2000000', null, {
      timeout: 7000
    });
    assert.match(await metric(page, 'Total Staked').innerText(), /2,000,000 STRX/);
    await page.getByPlaceholder('Staked amount').fill('3000000');
    options.snapshot.audituser.staked = 4000000;
    await page.clock.fastForward(121000);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.getByText('4,000,000 STRX', {
      exact: true
    }).waitFor();
    assert.equal(await page.getByPlaceholder('Staked amount').inputValue(), '3000000');
    await finiteBody(page);
    assert.deepEqual(fixtures.blocked, []);
    await context.close();
  } finally {
    await browser?.close();
    await server.close();
  }
});
test('post-snapshot stake actions reconcile once and zero global pool stays unavailable', async () => {
  const server = await startAuditServer();
  let browser;
  try {
    browser = await launch();
    for (const zeroPool of [false, true]) {
      const context = await browser.newContext({
        serviceWorkers: 'block',
        locale: 'en-US'
      });
      await context.addInitScript(() => {
        delete Navigator.prototype.serviceWorker;
      });
      const options = {
        origin: server.origin,
        config: zeroPool ? {
          rows: [{
            ...config.rows[0],
            stakes: '0 STRX'
          }]
        } : config,
        userActions: {
          audituser: [{
            timestamp: '2026-10-21T00:00:00Z',
            trx_id: 'stake-fixture',
            act: {
              data: {
                memo: 'add stake',
                quantity: '1000000 STRX'
              }
            }
          }]
        }
      };
      const fixtures = await installApiFixtures(context, options);
      const page = await context.newPage();
      page.setDefaultTimeout(7000);
      page.setDefaultNavigationTimeout(10000);
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(server.origin + '/?user=audituser');
      await page.getByText('2,000,000 STRX', {
        exact: true
      }).waitFor();
      assert.equal(await page.getByPlaceholder('Staked amount').inputValue(), '2000000');
      if (zeroPool) assert.match(await metric(page, 'Pool Share').innerText(), /N\/A/);else await page.getByText('670.8075 STRX', {
        exact: true
      }).waitFor();
      await finiteBody(page);
      assert.deepEqual(errors, []);
      assert.deepEqual(fixtures.blocked, []);
      await context.close();
    }
  } finally {
    await browser?.close();
    await server.close();
  }
});
test('late previous-account action response cannot change the next profile', async () => {
  const server = await startAuditServer();
  let browser;
  try {
    browser = await launch();
    const context = await browser.newContext({
      serviceWorkers: 'block',
      locale: 'en-US'
    });
    await context.addInitScript(() => {
      delete Navigator.prototype.serviceWorker;
    });
    const fixtures = await installApiFixtures(context, {
      origin: server.origin,
      userActionDelayMs: {
        audituser: 700
      },
      userActions: {
        audituser: [{
          timestamp: '2026-10-21T00:00:00Z',
          trx_id: 'late-fixture',
          act: {
            data: {
              memo: 'add stake',
              quantity: '9000000 STRX'
            }
          }
        }]
      }
    });
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    page.setDefaultNavigationTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(server.origin + '/?user=audituser');
    await page.getByRole('heading', {
      name: "audituser's Staking Profile"
    }).waitFor();
    const oldResponse = page.waitForResponse(response => response.url().includes('/v2/history/get_actions') && new URL(response.url()).searchParams.get('account') === 'audituser');
    await select(page, 'nextuser');
    await oldResponse;
    await metric(page, 'Total Staked').getByText('32,000,000 STRX', {
      exact: true
    }).waitFor();
    assert.equal(await page.getByPlaceholder('Staked amount').inputValue(), '32000000');
    assert.match(await metric(page, 'Pool Share').innerText(), /12.4224%/);
    assert.match(await metric(page, 'Total Unstaked').innerText(), /0 STRX/);
    await finiteBody(page);
    assert.deepEqual(errors, []);
    assert.deepEqual(fixtures.blocked, []);
    await context.close();
  } finally {
    await browser?.close();
    await server.close();
  }
});
