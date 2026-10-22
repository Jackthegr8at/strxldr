import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startAuditServer } from '../../scripts/serve-audit-build.mjs';
import { installApiFixtures, preservationFixtures, preservationBoundaries } from '../fixtures/api.mjs';
export const phase = 8;
const evidence = path.resolve('plan/audit-evidence/phase8');
fs.mkdirSync(evidence, {
  recursive: true
});
async function session(run) {
  const server = await startAuditServer({
    port: 4179
  });
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--disable-background-networking', `--log-file=${path.join(evidence, 'preservation-chromium.log')}`]
    });
    await run(browser, server.origin);
  } finally {
    await browser?.close();
    await server.close();
  }
}
async function open(browser, origin, dark, viewport = {
  width: 1440,
  height: 1000
}) {
  const context = await browser.newContext({
    viewport,
    locale: 'en-US',
    serviceWorkers: 'block',
    reducedMotion: 'reduce',
    colorScheme: dark ? 'dark' : 'light'
  });
  await context.addCookies([{
    name: 'strxldr-theme',
    value: dark ? 'dark' : 'light',
    url: origin
  }]);
  await context.addInitScript(() => {
    delete Navigator.prototype.serviceWorker;
    Object.defineProperty(navigator, 'share', {
      value: undefined,
      configurable: true
    });
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async text => {
          window.__copiedUrl = text;
        }
      },
      configurable: true
    });
  });
  const fixture = await installApiFixtures(context, {
    origin,
    ...preservationFixtures()
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin);
  await page.getByPlaceholder('Search by username...').waitFor();
  await page.waitForLoadState('networkidle');
  assert.equal(await page.locator('html').evaluate(e => e.classList.contains('dark')), dark);
  return {
    context,
    page,
    fixture,
    errors
  };
}
async function finish(s) {
  assert.deepEqual(s.errors, []);
  assert.deepEqual(s.fixture.blocked, [], 'external requests are fixtures or blocked before DNS');
  await s.context.close();
}
const table = page => page.getByTestId('leaderboard-table');
async function search(page, term) {
  await page.getByPlaceholder('Search by username...').fill(term);
  await page.waitForFunction(q => new URL(location.href).searchParams.get('q') === (q || null), term);
}
async function meta(page, title, description) {
  await page.waitForFunction(t => document.title === t, title);
  assert.match(await page.locator('meta[name="description"]').getAttribute('content'), description);
}
test('TEST-023: both themes preserve threshold boundaries, supply, live panels, amounts, clipboard and reduced-motion demand loading', async () => session(async (browser, origin) => {
  for (const dark of [false, true]) {
    const s = await open(browser, origin, dark);
    const {
      page
    } = s;
    await meta(page, 'STRX Staking Leaderboard', /staking statistics/);
    assert.equal(await page.locator('.tier-card').count(), 7);
    for (const [name, stake, tier] of preservationBoundaries) {
      await search(page, name);
      const row = table(page).locator('tbody tr').filter({
        has: page.getByRole('button', {
          name,
          exact: true
        })
      });
      await row.waitFor();
      assert.equal(await row.locator(`span[title="${tier}"]`).count(), 1, `${name} ${stake} remains ${tier}`);
    }
    await search(page, 'audituser');
    const row = table(page).locator('tbody tr').first();
    await row.getByRole('button', {
      name: 'audituser',
      exact: true
    }).waitFor();
    assert.equal(await row.locator('td').count(), 7, 'desktop retains every amount column');
    const amounts = [{
      index: 2,
      strx: '1,000,000.0000',
      usd: '$1,000.00'
    }, {
      index: 3,
      strx: '100.0000',
      usd: '$0.10'
    }, {
      index: 4,
      strx: '1,000,100.0000',
      usd: '$1,000.10'
    }];
    for (const amount of amounts) {
      const cell = row.locator('td').nth(amount.index);
      assert.ok((await cell.innerText()).includes(amount.strx));
      assert.ok((await cell.innerText()).includes(amount.index === 2 ? '0.0500%' : amount.index === 3 ? '0.0000%' : '0.0500%'), 'fixed two-billion supply percentages');
      await cell.click();
      assert.ok((await cell.innerText()).includes(amount.usd), await cell.innerText());
      await cell.click();
      assert.ok((await cell.innerText()).includes(amount.strx));
    }
    assert.match(await row.locator('td').nth(5).innerText(), /\$1,000\.10/);
    assert.match(await row.locator('td').nth(6).innerText(), /Daily:|Monthly:|Yearly:/);
    assert.equal(await row.getByTitle('View on Blockchain Explorer').getAttribute('href'), 'https://explorer.xprnetwork.org/account/audituser');
    const expectedUrl = page.url();
    await page.getByRole('button', {
      name: 'Share page'
    }).click();
    assert.equal(await page.evaluate(() => window.__copiedUrl), expectedUrl);
    assert.equal(await page.getByText('Link copied to clipboard!', {
      exact: true
    }).isVisible(), true);
    await search(page, '');
    await page.getByRole('heading', {
      name: 'New Stakers 🎉',
      exact: true
    }).scrollIntoViewIfNeeded();
    const newPanel = page.getByRole('heading', {
      name: 'New Stakers 🎉',
      exact: true
    }).locator('..');
    assert.ok((await newPanel.innerText()).includes('newarrival'));
    assert.ok((await newPanel.innerText()).includes('12,345'));
    const milestones = page.getByLabel('Tier milestones', {
      exact: true
    });
    assert.equal(await milestones.isVisible(), true);
    assert.ok((await milestones.innerText()).includes('nearmilestone'));
    const recent = page.getByLabel('Recent staking activity', {
      exact: true
    });
    assert.ok((await recent.innerText()).includes('audituser'));
    assert.equal(await recent.locator('a[href="https://explorer.xprnetwork.org/transaction/preservation-stake"]').count(), 1);
    const chartHeading = page.getByRole('heading', {
      name: 'Top 15 Holders Distribution',
      exact: true
    });
    await chartHeading.scrollIntoViewIfNeeded();
    await page.locator('.recharts-surface').waitFor();
    assert.equal(await page.locator('.recharts-surface').isVisible(), true, 'reduced motion retains lazy chart content');
    await page.getByRole('button', {
      name: 'About STRX Staking Leaderboard'
    }).click();
    await page.getByRole('dialog').waitFor();
    assert.equal(await page.getByRole('dialog').isVisible(), true);
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({
      state: 'detached'
    });
    await page.screenshot({
      path: path.join(evidence, `preservation-${dark ? 'dark' : 'light'}.png`),
      fullPage: true
    });
    await finish(s);
  }
}));
test('TEST-023: routes, query history, metadata and real theme cookie writes survive reload in both themes', async () => session(async (browser, origin) => {
  for (const dark of [false, true]) {
    const s = await open(browser, origin, dark);
    const {
      page
    } = s;
    await search(page, 'audit');
    await page.locator('.tier-card').filter({
      has: page.getByText('Fish', {
        exact: true
      })
    }).click();
    await page.getByRole('button', {
      name: 'Sort by',
      exact: true
    }).click();
    await page.getByRole('button', {
      name: 'Total Amount',
      exact: true
    }).click();
    await page.waitForFunction(() => new URL(location.href).searchParams.get('sort') === 'total');
    const homeUrl = page.url();
    assert.equal(new URL(homeUrl).searchParams.get('tier'), 'Fish');
    await table(page).getByRole('button', {
      name: 'audituser',
      exact: true
    }).click();
    await page.getByRole('heading', {
      name: "audituser's Staking Profile",
      exact: true
    }).waitFor();
    await meta(page, 'audituser | STRX Staking Leaderboard', /audituser's staking stats/);
    assert.equal(new URL(page.url()).searchParams.get('user'), 'audituser');
    await page.getByRole('button', {
      name: 'Back to Leaderboard'
    }).click();
    await page.getByPlaceholder('Search by username...').waitFor();
    assert.equal(page.url(), homeUrl);
    await page.goBack();
    await page.getByRole('heading', {
      name: "audituser's Staking Profile",
      exact: true
    }).waitFor();
    await page.goForward();
    await page.getByPlaceholder('Search by username...').waitFor();
    assert.equal(await page.getByPlaceholder('Search by username...').inputValue(), 'audit');
    await page.getByText('Bridge Balance', {
      exact: true
    }).click();
    await page.getByRole('heading', {
      name: 'STRX Bridge Dashboard',
      exact: true
    }).waitFor();
    assert.equal(new URL(page.url()).pathname, '/bridge');
    await meta(page, 'STRX Bridge | STRX Staking Leaderboard', /Bridge your STRX tokens/);
    await page.goBack();
    await page.getByPlaceholder('Search by username...').waitFor();
    assert.equal(page.url(), homeUrl);
    await page.goForward();
    await page.getByRole('heading', {
      name: 'STRX Bridge Dashboard',
      exact: true
    }).waitFor();
    await page.getByRole('button', {
      name: dark ? 'Switch to light mode' : 'Switch to dark mode',
      exact: true
    }).click();
    assert.equal(await page.locator('html').evaluate(e => e.classList.contains('dark')), !dark);
    await page.waitForTimeout(50);
    const cookie = (await s.context.cookies(origin)).find(c => c.name === 'strxldr-theme');
    assert.equal(cookie?.value, dark ? 'light' : 'dark', 'real theme toggle updates host cookie');
    await page.reload();
    await page.getByRole('heading', {
      name: 'STRX Bridge Dashboard',
      exact: true
    }).waitFor();
    assert.equal(await page.locator('html').evaluate(e => e.classList.contains('dark')), !dark, 'actual cookie preserves selected theme through reload');
    await finish(s);
  }
}));
test('TEST-023: mobile column selection preserves every amount, sort query and exact unit toggles', async () => session(async (browser, origin) => {
  for (const dark of [false, true]) {
    const s = await open(browser, origin, dark, {
      width: 390,
      height: 844
    });
    const {
      page
    } = s;
    await search(page, 'audituser');
    const select = page.locator('select').filter({
      has: page.locator('option[value="usdValue"]')
    });
    for (const [column, header, strx, usd] of [['staked', 'Staked Amount', '1,000,000.0000', '$1,000.00'], ['unstaked', 'Unstaked Amount', '100.0000', '$0.10'], ['total', 'Total Amount', '1,000,100.0000', '$1,000.10'], ['usdValue', 'USD Value', null, '$1,000.10'], ['rewards', 'Estimated Rewards', null, null]]) {
      await select.selectOption(column);
      await page.waitForFunction(sort => new URL(location.href).searchParams.get('sort') === sort || sort === 'staked' && !new URL(location.href).searchParams.has('sort'), column === 'usdValue' ? 'total' : column);
      assert.equal(await table(page).locator('thead th').count(), 3);
      assert.equal(await table(page).locator('thead th').last().innerText(), header);
      const cell = table(page).locator('tbody tr').first().locator('td').last();
      if (strx) {
        assert.ok((await cell.innerText()).includes(strx));
        await cell.click();
        assert.ok((await cell.innerText()).includes(usd), await cell.innerText());
        await cell.click();
        assert.ok((await cell.innerText()).includes(strx));
      } else if (usd) assert.ok((await cell.innerText()).includes(usd));else assert.match(await cell.innerText(), /Daily:|Monthly:|Yearly:/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    }
    await finish(s);
  }
}));
