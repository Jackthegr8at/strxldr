import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startAuditServer } from '../../scripts/serve-audit-build.mjs';
import { installApiFixtures } from '../fixtures/api.mjs';
export const phase = 8;
const evidence = path.resolve('plan/audit-evidence/phase8/bridge-layout');
fs.mkdirSync(evidence, {
  recursive: true
});
test('final bridge regression: nine cold viewport/delay conditions keep CLS <= .10 and all history reachable', async () => {
  const server = await startAuditServer({
    port: 4180
  });
  let browser;
  const results = [];
  try {
    browser = await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--disable-background-networking', `--log-file=${path.join(evidence, 'chromium.log')}`]
    });
    for (const viewport of [{
      width: 390,
      height: 844
    }, {
      width: 768,
      height: 1024
    }, {
      width: 1440,
      height: 1000
    }]) for (const delay of [0, 300, 1000]) {
      const context = await browser.newContext({
        viewport,
        locale: 'en-US',
        serviceWorkers: 'block'
      });
      await context.addInitScript(() => {
        delete Navigator.prototype.serviceWorker;
        window.__bridgeShifts = [];
        new PerformanceObserver(list => {
          for (const e of list.getEntries()) if (!e.hadRecentInput) window.__bridgeShifts.push({
            value: e.value,
            time: e.startTime,
            sources: e.sources?.map(s => ({
              html: s.node?.outerHTML?.slice(0, 300),
              previous: s.previousRect,
              current: s.currentRect
            }))
          });
        }).observe({
          type: 'layout-shift',
          buffered: true
        });
      });
      const fixture = await installApiFixtures(context, {
        origin: server.origin,
        delayByKind: {
          balance: delay,
          table: delay * 2,
          raydium: delay * 3,
          history: delay
        }
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      try {
        await page.goto(server.origin + '/bridge');
        await page.getByRole('heading', {
          name: 'STRX Bridge Dashboard',
          exact: true
        }).waitFor();
        assert.equal(await page.getByTestId('bridge-statistics').locator('[aria-busy]').count(), 4, 'four cards remain mounted before data');
        const initial = await page.getByTestId('bridge-statistics').boundingBox();
        await page.waitForLoadState('networkidle');
        await page.waitForFunction(() => document.querySelectorAll('[aria-label="Bridge activity history"] tbody tr').length === 30);
        await page.waitForTimeout(100);
        const loaded = await page.getByTestId('bridge-statistics').boundingBox();
        assert.equal(loaded.height, initial.height, 'stats reserve identical initial and loaded geometry');
        const history = page.getByLabel('Bridge activity history', {
          exact: true
        });
        assert.equal((await history.boundingBox()).height, viewport.width < 768 ? 560 : 540);
        assert.equal(await history.evaluate(n => getComputedStyle(n).overflowY), 'auto');
        assert.equal(await history.locator('tbody tr').count(), 30);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        const shifts = await page.evaluate(() => window.__bridgeShifts);
        let maximum = 0,
          score = 0,
          start = 0,
          last = 0;
        for (const s of shifts) {
          if (s.time - last > 1000 || s.time - start > 5000) {
            score = 0;
            start = s.time;
          }
          score += s.value;
          last = s.time;
          maximum = Math.max(maximum, score);
        }
        const label = `bridge-${viewport.width}-${delay}`;
        await page.screenshot({
          path: path.join(evidence, label + '-viewport.png'),
          scale: 'css'
        });
        await page.screenshot({
          path: path.join(evidence, label + '-full.png'),
          fullPage: true,
          scale: 'css'
        });
        results.push({
          viewport,
          delay,
          cls: maximum,
          shifts,
          statsHeight: loaded.height,
          historyHeight: viewport.width < 768 ? 560 : 540
        });
        assert.ok(maximum <= .10, JSON.stringify(results.at(-1)));
        await history.locator('tbody tr').last().scrollIntoViewIfNeeded();
        assert.equal(await history.locator('tbody tr').last().isVisible(), true, 'last loaded row reachable through internal scrolling');
        const pagination = page.getByTestId('bridge-pagination');
        await pagination.getByRole('button', {
          name: 'Next',
          exact: true
        }).click();
        await page.waitForFunction(() => document.querySelector('[data-testid="bridge-pagination"]').textContent.includes('Page 2 of'));
        assert.equal(await history.locator('tbody tr').count(), 30);
        await pagination.getByRole('button', {
          name: 'Previous',
          exact: true
        }).click();
        await page.waitForFunction(() => document.querySelector('[data-testid="bridge-pagination"]').textContent.includes('Page 1 of'));
        assert.deepEqual(errors, []);
        assert.deepEqual(fixture.blocked, []);
      } finally {
        await context.close();
      }
    }
    assert.equal(results.length, 9);
  } finally {
    fs.writeFileSync(path.join(evidence, 'cls.json'), JSON.stringify(results, null, 2));
    await browser?.close();
    await server.close();
  }
});
