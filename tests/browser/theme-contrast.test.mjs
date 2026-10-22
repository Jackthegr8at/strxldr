import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startAuditServer } from '../../scripts/serve-audit-build.mjs';
import { installApiFixtures, preservationFixtures } from '../fixtures/api.mjs';
export const phase = 8;
const evidence = path.resolve('plan/audit-evidence/theme-contrast');
fs.mkdirSync(evidence, { recursive: true });

async function inspectText(page) {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d');
    const rgb = color => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data]; };
    const luminance = values => values.slice(0, 3).map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4).reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
    const results = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (el.closest('script,style,svg,canvas,[aria-hidden="true"]')) continue;
      const style = getComputedStyle(el);
      if (!el.getClientRects().length || style.visibility !== 'visible' || style.opacity === '0') continue;
      const text = [...el.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent).join(' ').trim();
      if (!/[\p{L}\p{N}]/u.test(text)) continue;
      const parents = []; for (let p = el; p; p = p.parentElement) parents.unshift(p);
      ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 1, 1);
      for (const p of parents) { ctx.fillStyle = getComputedStyle(p).backgroundColor; ctx.fillRect(0, 0, 1, 1); }
      const background = [...ctx.getImageData(0, 0, 1, 1).data];
      const foreground = rgb(style.color); const a = luminance(foreground), b = luminance(background);
      const contrast = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
      const neutral = Math.max(...foreground.slice(0, 3)) - Math.min(...foreground.slice(0, 3)) <= 45;
      const heading = /^H[1-6]$/.test(el.tagName);
      if (heading || (neutral && b < .08 && !el.closest(':disabled'))) results.push({ text: text.slice(0, 100), tag: el.tagName, classes: el.className, foreground, background, contrast, heading });
    }
    return results;
  });
}

test('theme contrast: all route headings and neutral dark-mode text remain readable at mobile and desktop widths', async () => {
  const server = await startAuditServer({ port: 4182 }); let browser; const runs = [];
  try {
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--disable-background-networking', `--log-file=${path.join(evidence, 'chromium.log')}`] });
    for (const width of [390, 1440]) for (const theme of ['dark', 'light']) for (const [name, route] of [['home', '/'], ['bridge', '/bridge'], ['profile', '/?user=audituser'], ['no-stake', '/?user=nostake']]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
      try {
        await context.addCookies([{ name: 'strxldr-theme', value: theme, url: server.origin }]);
        await context.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
        const fixtures = await installApiFixtures(context, { origin: server.origin, ...preservationFixtures() });
        const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
        await page.goto(server.origin + route); await page.waitForLoadState('networkidle');
        assert.equal(await page.locator('html').evaluate(el => el.classList.contains('dark')), theme === 'dark');
        if (name === 'home') {
          await page.getByRole('heading', { name: 'New Stakers 🎉', exact: true }).waitFor();
          await page.getByRole('heading', { name: 'Top 15 Holders Distribution', exact: true }).scrollIntoViewIfNeeded();
          await page.locator('.recharts-surface').waitFor(); await page.waitForLoadState('networkidle');
        }
        await page.evaluate(() => document.fonts.ready);
        const states = [{ name: 'page', text: await inspectText(page) }];
        if (name === 'home') {
          if (width === 1440) { await page.getByRole('button', { name: 'Sort by', exact: true }).click(); states.push({ name: 'sort-menu', text: await inspectText(page) }); await page.keyboard.press('Escape'); }
          await page.getByRole('button', { name: 'About STRX Staking Leaderboard' }).click(); await page.getByRole('dialog').waitFor(); states.push({ name: 'dialog', text: await inspectText(page) }); await page.keyboard.press('Escape');
          await page.getByRole('heading', { name: 'New Stakers 🎉', exact: true }).scrollIntoViewIfNeeded();
        }
        const run = { width, theme, route: name, states, failures: states.flatMap(state => state.text.filter(item => item.contrast < 4.5).map(item => ({ state: state.name, ...item }))) };
        runs.push(run);
        await page.screenshot({ path: path.join(evidence, `${width}-${theme}-${name}.png`), fullPage: true, animations: 'disabled' });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        assert.deepEqual(errors, []); assert.deepEqual(fixtures.blocked, []);
      } finally { await context.close(); }
    }
    assert.equal(runs.length, 16);
    assert.deepEqual(runs.flatMap(run => run.failures.map(failure => ({ width: run.width, theme: run.theme, route: run.route, ...failure }))), []);
  } finally { fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify(runs, null, 2)); await browser?.close(); await server.close(); }
});
