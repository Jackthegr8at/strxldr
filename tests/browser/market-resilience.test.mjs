import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startAuditServer } from '../../scripts/serve-audit-build.mjs';
import { installApiFixtures, raydium } from '../fixtures/api.mjs';
export const phase = 2;
test('dashboard and bridge tolerate empty, partial, invalid and zero Raydium responses', async () => {
  const server = await startAuditServer();
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--disable-background-networking', `--log-file=${path.resolve('plan/audit-evidence/phase2-chromium.log')}`]
    });
    const payloads = [raydium({
      emptyApr: true
    }), raydium({
      partial: true
    }), {
      success: false,
      data: []
    }, {
      success: true,
      data: []
    }, {
      success: true,
      data: [{
        price: 'bad',
        day: {
          apr: 'bad',
          rewardApr: []
        }
      }]
    }, {
      success: true,
      data: [{
        price: 0,
        tvl: 0,
        mintAmountA: 0,
        mintAmountB: 0,
        day: {
          volume: 0,
          apr: 0,
          feeApr: 0,
          rewardApr: [0]
        },
        week: {
          volume: 0
        },
        month: {
          volume: 0
        }
      }]
    }];
    for (const payload of payloads) for (const route of ['/', '/bridge']) {
      const context = await browser.newContext({
        serviceWorkers: 'block',
        locale: 'en-US'
      });
      try {
        await context.addInitScript(() => {
          delete Navigator.prototype.serviceWorker;
        });
        const fixtures = await installApiFixtures(context, {
          origin: server.origin,
          marketPayload: payload
        });
        const page = await context.newPage();
        page.setDefaultTimeout(7000);
        page.setDefaultNavigationTimeout(10000);
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => {
          if (m.type() === 'error' && /ErrorBoundary|React error|An error occurred/.test(m.text())) errors.push(m.text());
        });
        await page.goto(server.origin + route);
        await page.getByText('Reward APR:', {
          exact: false
        }).waitFor();
        const body = await page.locator('body').innerText();
        assert.deepEqual(errors, []);
        assert.doesNotMatch(body, /NaN|Infinity|Something went wrong/);
        if (payload.data?.[0]?.day?.rewardApr?.[0] === 0) assert.match(body, /Reward APR: 0\.00%/);else assert.match(body, /Reward APR: N\/A%/);
        assert.deepEqual(fixtures.blocked, []);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser?.close();
    await server.close();
  }
});
