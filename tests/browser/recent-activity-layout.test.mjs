import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startAuditServer } from '../../scripts/serve-audit-build.mjs';
import { installApiFixtures, preservationFixtures, sourceTime } from '../fixtures/api.mjs';
export const phase = 8;
const evidence = path.resolve('plan/audit-evidence/recent-activity-layout');
fs.mkdirSync(evidence, {
  recursive: true
});
const actions = Array.from({
  length: 15
}, (_, i) => ({
  global_sequence: String(9000 + i),
  timestamp: new Date(Date.parse(sourceTime) - i * 60000).toISOString(),
  trx_id: 'layout-' + i,
  act: {
    name: 'transfer',
    data: {
      from: i % 3 === 0 ? 'storexstake' : i % 3 === 1 ? 'coast12' : 'brandnew12',
      to: i % 3 === 0 ? 'coast12' : 'storexstake',
      quantity: (i === 0 ? '123456789.1234' : i % 2 ? '6000.0000' : '20000.0000') + ' STRX',
      memo: i % 3 === 0 ? 'withdraw stake' : 'add stake'
    }
  }
}));
test('recent activity keeps every transaction detail and action visible without horizontal scrolling', async () => {
  const server = await startAuditServer({
    port: 4185
  });
  let browser;
  const results = [];
  try {
    browser = await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--disable-background-networking', `--log-file=${path.join(evidence, 'chromium.log')}`]
    });
    for (const width of [320, 390, 768, 1024, 1440, 2048]) for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({
        viewport: {
          width,
          height: 1000
        },
        serviceWorkers: 'block',
        locale: 'en-US',
        reducedMotion: 'reduce'
      });
      try {
        await context.addCookies([{
          name: 'strxldr-theme',
          value: theme,
          url: server.origin
        }]);
        await context.addInitScript(() => {
          delete Navigator.prototype.serviceWorker;
        });
        const fixture = await installApiFixtures(context, {
          origin: server.origin,
          ...preservationFixtures(),
          userActions: {
            storexstake: actions
          }
        });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.goto(server.origin);
        await page.waitForLoadState('networkidle');
        const panel = page.getByLabel('Recent staking activity', {
          exact: true
        });
        await panel.scrollIntoViewIfNeeded();
        const geometry = await panel.evaluate(panel => ({
          width: panel.clientWidth,
          scrollWidth: panel.scrollWidth,
          height: panel.clientHeight,
          horizontal: [panel, ...panel.querySelectorAll('*')].filter(e => ['auto', 'scroll'].includes(getComputedStyle(e).overflowX) && e.scrollWidth > e.clientWidth + 1).map(e => ({
            tag: e.tagName,
            cls: e.className,
            client: e.clientWidth,
            scroll: e.scrollWidth
          }))
        }));
        results.push({
          width,
          theme,
          ...geometry
        });
        await panel.screenshot({
          path: path.join(evidence, `${width}-${theme}.png`)
        });
        assert.deepEqual(geometry.horizontal, [], JSON.stringify(results.at(-1)));
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        const clipped = await panel.evaluate(panel => {
          const edge = panel.getBoundingClientRect();
          const failures = [];
          const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
          let node;
          while (node = walker.nextNode()) {
            if (!node.textContent.trim()) continue;
            const range = document.createRange();
            range.selectNodeContents(node);
            for (const rect of range.getClientRects()) if (rect.width && (rect.left < edge.left - 1 || rect.right > edge.left + panel.clientWidth + 1)) failures.push(node.textContent.trim());
          }
          return failures;
        });
        assert.deepEqual(clipped, [], 'all transaction text fits, without hidden or clipped columns');
        const items = panel.getByRole('listitem');
        assert.equal(await items.count(), 15);
        const first = items.first();
        assert.ok((await first.innerText()).includes('123,456,789.1234 STRX'));
        assert.ok((await first.innerText()).includes('$123,456.79'));
        assert.ok((await first.innerText()).includes('Withdraw'));
        assert.equal(await first.locator('time').getAttribute('datetime'), actions[0].timestamp);
        assert.equal(await first.locator('a').getAttribute('href'), 'https://explorer.xprnetwork.org/transaction/layout-0');
        await items.last().scrollIntoViewIfNeeded();
        assert.equal(await items.last().isVisible(), true);
        assert.equal(await panel.evaluate(e => e.scrollLeft), 0);
        await first.getByTitle('Search this user', {
          exact: true
        }).click();
        assert.equal(await page.getByPlaceholder('Search by username...').inputValue(), 'coast12');
        assert.equal(await page.getByPlaceholder('Search by username...').evaluate(e => document.activeElement === e), true);
        assert.deepEqual(errors, []);
        assert.deepEqual(fixture.blocked, []);
      } finally {
        await context.close();
      }
    }
    assert.equal(results.length, 12);
  } finally {
    fs.writeFileSync(path.join(evidence, 'geometry.json'), JSON.stringify(results, null, 2));
    await browser?.close();
    await server.close();
  }
});
