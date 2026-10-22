import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startAuditServer } from '../../scripts/serve-audit-build.mjs';
import { installApiFixtures, snapshot, sourceTime } from '../fixtures/api.mjs';
export const phase = 5;
const launch = () => chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--disable-background-networking', `--log-file=${path.resolve('plan/audit-evidence/phase5-chromium.log')}`]
});
async function scenario(run) {
  const server = await startAuditServer();
  let browser;
  try {
    browser = await launch();
    await run(browser, server);
  } finally {
    await browser?.close();
    await server.close();
  }
}
async function setup(browser, server, pathname, options = {}) {
  const context = await browser.newContext({
    serviceWorkers: 'block',
    locale: 'en-US',
    viewport: {
      width: 1440,
      height: 1000
    }
  });
  await context.addInitScript(() => {
    delete Navigator.prototype.serviceWorker;
  });
  const fixtures = await installApiFixtures(context, {
    origin: server.origin,
    ...options
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  await page.clock.install();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /ErrorBoundary|React error|An error occurred/.test(message.text())) errors.push(message.text());
  });
  if (pathname) await page.goto(server.origin + pathname);
  return {
    context,
    page,
    fixtures,
    errors
  };
}
function resources(fixtures) {
  const counts = {};
  for (const request of fixtures.requests) {
    const url = new URL(request.url);
    let body = {};
    try {
      body = JSON.parse(request.body || '{}');
    } catch {}
    let name;
    if (url.pathname.endsWith('/stakes.json')) name = 'snapshot';else if (url.pathname.endsWith('/newstakers.json')) name = 'newStakers';else if (url.pathname.endsWith('/get_table_rows') && request.method === 'POST') name = body.code === 'strxoracle' && body.table === 'prices' ? 'oracle' : body.code === 'storexstake' && body.table === 'config' ? 'config' : 'unexpectedTable';else if (url.pathname.endsWith('/get_currency_balance') && request.method === 'POST') name = `balance:${body.account}`;else if (url.pathname.endsWith('/get_actions') && request.method === 'GET') name = `history:${request.query.account}:${request.query.skip || 0}`;else if (url.hostname === 'api-v3.raydium.io') name = 'raydium';else if (url.hostname === 'api.dexscreener.com') name = 'dex';else if (url.hostname === 'www.api.bloks.io') name = 'xsol';else continue;
    counts[name] = (counts[name] || 0) + 1;
  }
  return counts;
}
function healthy(fixtures, errors) {
  assert.deepEqual(fixtures.blocked, []);
  assert.deepEqual(errors, []);
}
const heading = (page, user) => page.getByRole('heading', {
  name: `${user}'s Staking Profile`
});
function assertUrl(page, pathname, params = {}) {
  const url = new URL(page.url());
  assert.equal(url.pathname, pathname);
  for (const [name, value] of Object.entries(params)) assert.equal(url.searchParams.get(name), value);
}
test('cold bridge owns only balance, oracle, Raydium and history; mounted polling stays route scoped', async () => scenario(async (browser, server) => {
  const {
    context,
    page,
    fixtures,
    errors
  } = await setup(browser, server, '/bridge');
  try {
    await page.getByRole('heading', {
      name: 'STRX Bridge Dashboard'
    }).waitFor();
    await page.locator('a[href*="synthetic-0"]').first().waitFor();
    await page.waitForTimeout(100);
    assert.deepEqual(resources(fixtures), {
      'balance:bridge.strx': 1,
      oracle: 1,
      raydium: 1,
      'history:bridge.strx:0': 1
    });
    await page.clock.runFor(301000);
    await page.waitForTimeout(100);
    const polled = resources(fixtures);
    assert.equal(polled.oracle, 2);
    assert.equal(polled.raydium, 2);
    assert.equal(polled['balance:bridge.strx'], 2);
    assert.equal(polled['history:bridge.strx:0'], 3);
    assert.deepEqual(Object.keys(polled).sort(), ['balance:bridge.strx', 'history:bridge.strx:0', 'oracle', 'raydium']);
    healthy(fixtures, errors);
  } finally {
    await context.close();
  }
}));
test('cold staker shares one oracle query and polls user activity without leaderboard-only requests', async () => scenario(async (browser, server) => {
  const {
    context,
    page,
    fixtures,
    errors
  } = await setup(browser, server, '/?user=audituser');
  try {
    await heading(page, 'audituser').waitFor();
    await page.getByPlaceholder('Staked amount').waitFor();
    await page.getByTestId('bridge-pagination').getByRole('button', {
      name: 'Next',
      exact: true
    }).waitFor();
    await page.waitForTimeout(100);
    const initial = resources(fixtures);
    assert.equal(initial.oracle, 1);
    assert.equal(initial.newStakers, undefined);
    assert.equal(initial['history:storexstake:0'], undefined);
    assert.equal(initial['history:audituser:0'], 1);
    await page.clock.runFor(61000);
    await page.waitForTimeout(100);
    const after = resources(fixtures);
    assert.equal(after['history:audituser:0'], 2);
    assert.equal(after.oracle, 1);
    assert.equal(after.newStakers, undefined);
    assert.equal(after['history:storexstake:0'], undefined);
    healthy(fixtures, errors);
  } finally {
    await context.close();
  }
}));
test('visible account and bridge navigation preserve filter URLs and Back/Forward route state', async () => scenario(async (browser, server) => {
  const {
    context,
    page,
    fixtures,
    errors
  } = await setup(browser, server, '/?q=audit&tier=Fish&sort=total');
  try {
    await page.getByPlaceholder('Search by username...').waitFor();
    await page.getByRole('button', {
      name: 'audituser',
      exact: true
    }).first().click();
    await heading(page, 'audituser').waitFor();
    assertUrl(page, '/', {
      user: 'audituser',
      q: 'audit',
      tier: 'Fish',
      sort: 'total'
    });
    await page.getByRole('button', {
      name: 'Back to Leaderboard'
    }).click();
    await page.getByPlaceholder('Search by username...').waitFor();
    assertUrl(page, '/', {
      user: null,
      q: 'audit',
      tier: 'Fish',
      sort: 'total'
    });
    assert.equal(await page.getByPlaceholder('Search by username...').inputValue(), 'audit');
    await page.goBack();
    await heading(page, 'audituser').waitFor();
    assertUrl(page, '/', {
      user: 'audituser'
    });
    await page.goForward();
    await page.getByPlaceholder('Search by username...').waitFor();
    await page.getByText('Bridge Balance', {
      exact: true
    }).click();
    await page.getByRole('heading', {
      name: 'STRX Bridge Dashboard'
    }).waitFor();
    assertUrl(page, '/bridge', {
      user: null,
      q: 'audit',
      tier: 'Fish',
      sort: 'total'
    });
    await page.goBack();
    await page.getByPlaceholder('Search by username...').waitFor();
    assertUrl(page, '/', {
      user: null,
      q: 'audit',
      tier: 'Fish',
      sort: 'total'
    });
    await page.goForward();
    await page.getByRole('heading', {
      name: 'STRX Bridge Dashboard'
    }).waitFor();
    await page.getByRole('button', {
      name: 'Back to Leaderboard'
    }).click();
    await page.getByPlaceholder('Search by username...').waitFor();
    await page.locator('.tier-card').filter({
      has: page.getByText('Fish', {
        exact: true
      })
    }).click();
    await page.getByPlaceholder('Search by username...').fill('nextuser');
    await page.getByRole('button', {
      name: 'nextuser',
      exact: true
    }).first().click();
    await heading(page, 'nextuser').waitFor();
    assertUrl(page, '/', {
      user: 'nextuser',
      q: 'nextuser',
      tier: null,
      sort: 'total'
    });
    assert.equal(await page.getByPlaceholder('Staked amount').inputValue(), '32000000');
    healthy(fixtures, errors);
  } finally {
    await context.close();
  }
}));
test('failed user snapshot shows usable Retry and resolves membership without document reload', async () => scenario(async (browser, server) => {
  const {
    context,
    page,
    fixtures,
    errors
  } = await setup(browser, server);
  let fail = true,
    attempts = 0,
    documents = 0;
  page.on('request', request => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents++;
  });
  await context.route('https://nfts.jessytremblay.com/STRX/stakes.json', route => {
    attempts++;
    return route.fulfill({
      status: fail ? 503 : 200,
      contentType: 'application/json',
      headers: {
        'access-control-allow-origin': '*',
        'last-modified': new Date(sourceTime).toUTCString()
      },
      body: JSON.stringify(fail ? {
        error: 'synthetic failure'
      } : snapshot)
    });
  });
  try {
    await page.goto(server.origin + '/?user=audituser');
    await page.getByRole('alert').filter({
      hasText: 'Unable to load data'
    }).waitFor();
    assert.equal(await heading(page, 'audituser').count(), 0);
    assert.equal(await page.getByRole('heading', {
      name: "audituser's Profile",
      exact: true
    }).count(), 0);
    assert.doesNotMatch(await page.locator('body').innerText(), /No Staking|No Stake Profile/);
    fail = false;
    await page.getByRole('button', {
      name: 'Retry',
      exact: true
    }).click();
    await heading(page, 'audituser').waitFor();
    assert.equal(await page.getByPlaceholder('Staked amount').inputValue(), '1000000');
    assert.equal(attempts, 2);
    assert.equal(documents, 1);
    healthy(fixtures, errors.filter(error => !error.includes('503')));
  } finally {
    await context.close();
  }
}));
test('same mounted leaderboard restores q, tier and sort from popstate and browser history', async () => scenario(async (browser, server) => {
  const {
    context,
    page,
    fixtures,
    errors
  } = await setup(browser, server, '/?q=audit&tier=Fish&sort=total');
  const selectedTier = name => page.locator('.tier-card').filter({
    has: page.getByText(name, {
      exact: true
    })
  });
  try {
    await page.getByText('audituser', {
      exact: true
    }).first().waitFor();
    const navigations = [];
    page.on('request', request => {
      if (request.isNavigationRequest()) navigations.push(request.url());
    });
    await page.evaluate(() => {
      history.pushState({}, '', '/?q=nextuser&tier=Whale&sort=unstaked');
      dispatchEvent(new PopStateEvent('popstate'));
    });
    await page.waitForFunction(() => document.querySelector('#staker-search')?.value === 'nextuser');
    await page.getByText('nextuser', {
      exact: true
    }).first().waitFor();
    assert.match(await selectedTier('Whale').getAttribute('class'), /bg-purple-100/);
    assertUrl(page, '/', {
      q: 'nextuser',
      tier: 'Whale',
      sort: 'unstaked'
    });
    await page.goBack();
    await page.waitForFunction(() => document.querySelector('#staker-search')?.value === 'audit');
    await page.getByText('audituser', {
      exact: true
    }).first().waitFor();
    assert.match(await selectedTier('Fish').getAttribute('class'), /bg-purple-100/);
    assertUrl(page, '/', {
      q: 'audit',
      tier: 'Fish',
      sort: 'total'
    });
    await page.goForward();
    await page.waitForFunction(() => document.querySelector('#staker-search')?.value === 'nextuser');
    await page.getByText('nextuser', {
      exact: true
    }).first().waitFor();
    assertUrl(page, '/', {
      q: 'nextuser',
      tier: 'Whale',
      sort: 'unstaked'
    });
    assert.deepEqual(navigations, []);
    healthy(fixtures, errors);
  } finally {
    await context.close();
  }
}));
test('secondary homepage feed failures retain healthy snapshot controls and persistent local Retry', async () => scenario(async (browser, server) => {
  for (const failedFeed of ['raydium', 'newStakers']) {
    const {
      context,
      page,
      fixtures,
      errors
    } = await setup(browser, server, '/', {
      fail: failedFeed
    });
    try {
      const search = page.getByPlaceholder('Search by username...');
      await search.waitFor();
      const failure = page.getByRole('alert').filter({
        hasText: 'Unable to load data'
      }).first();
      await failure.waitFor();
      await failure.getByRole('button', {
        name: 'Retry',
        exact: true
      }).waitFor();
      await search.fill('audituser');
      const account = page.getByRole('button', {
        name: 'audituser',
        exact: true
      }).first();
      await account.waitFor();
      assert.match(await account.locator('xpath=ancestor::tr').innerText(), /1,000,000/);
      assert.equal(await failure.getByRole('button', {
        name: 'Retry',
        exact: true
      }).isEnabled(), true);
      await failure.getByRole('button', {
        name: 'Retry',
        exact: true
      }).click();
      await failure.waitFor();
      await account.waitFor();
      const content = await page.locator('body').innerText();
      assert.doesNotMatch(content, /NaN|Infinity|Something went wrong/);
      if (failedFeed === 'raydium') assert.doesNotMatch(content, /TVL: \$0(?:\D|$)|Reward APR: 0\.00%/);
      healthy(fixtures, errors.filter(error => !error.includes('503')));
    } finally {
      await context.close();
    }
  }
}));
