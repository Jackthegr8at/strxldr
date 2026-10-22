import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startAuditServer } from '../../scripts/serve-audit-build.mjs';
import { bridgeActions, installApiFixtures } from '../fixtures/api.mjs';
export const phase = 4;
const launch = () => chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--disable-background-networking', `--log-file=${path.resolve('plan/audit-evidence/phase4-chromium.log')}`]
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
async function setup(browser, server, route, options = {}) {
  const context = await browser.newContext({
    serviceWorkers: 'block'
  });
  await context.addInitScript(() => {
    delete Navigator.prototype.serviceWorker;
  });
  const pageErrors = [];
  const fixtures = await installApiFixtures(context, {
    origin: server.origin,
    ...options
  });
  fixtures.pageErrors = pageErrors;
  const page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  page.setDefaultTimeout(10000);
  await page.clock.install();
  await page.goto(server.origin + route);
  const controls = page.getByTestId('bridge-pagination');
  await controls.getByRole('button', {
    name: 'Next',
    exact: true
  }).waitFor();
  await page.waitForFunction(() => { const button = [...document.querySelectorAll('[data-testid=bridge-pagination] button')].find(b => b.textContent === 'Next'); return button && !button.disabled; });
  return {
    context,
    page,
    controls,
    fixtures
  };
}
const offsets = f => f.requests.filter(r => r.kind === 'history' && r.query.account === 'bridge.strx').map(r => Number(r.query.skip || 0));
test('all bridge consumers reach sparse activity, recover failed cursor and bound empty labels', async () => scenario(async (browser, server) => {
  for (const route of ['/bridge', '/?user=audituser', '/?user=missinguser']) {
    let failed = false;
    const match = route.includes('missing') ? 'missinguser' : 'audituser';
    const rows = bridgeActions.map(a => ({
      ...a,
      act: {
        ...a.act,
        data: {
          ...a.act.data,
          from: a.act.data.from === 'audituser' ? match : a.act.data.from
        }
      }
    }));
    const {
      context,
      page,
      controls,
      fixtures
    } = await setup(browser, server, route, {
      bridgeActions: rows,
      bridgeResponse: skip => {
        if (skip === 300 && !failed) {
          failed = true;
          return {
            status: 503
          };
        }
      }
    });
    try {
      if (route === '/bridge') {
        await controls.getByRole('button', {
          name: 'Last loaded',
          exact: true
        }).click();
      } else await controls.getByText('Page 1 of 1', {
        exact: true
      }).waitFor();
      await controls.getByRole('button', {
        name: 'Next',
        exact: true
      }).click();
      await controls.getByRole('button', {
        name: 'Retry',
        exact: true
      }).waitFor();
      assert.equal(await controls.getByRole('button', {
        name: 'Next',
        exact: true
      }).isEnabled(), true);
      await controls.getByRole('button', {
        name: 'Retry',
        exact: true
      }).click();
      await page.locator(`a[href*="synthetic-${route === '/bridge' ? 300 : 350}"]`).first().waitFor();
      assert.deepEqual(offsets(fixtures), [0, 300, 300]);
      if (route !== '/bridge') {
        await controls.getByRole('button', {
          name: 'Next',
          exact: true
        }).click();
        await controls.getByText('Page 2 of 2', {
          exact: true
        }).waitFor();
        assert.deepEqual(offsets(fixtures), [0, 300, 300, 600]);
        assert.equal(await controls.getByRole('button', {
          name: 'Next',
          exact: true
        }).isEnabled(), false);
      }
      assert.deepEqual(fixtures.blocked, []);
    assert.deepEqual(fixtures.pageErrors, []);
    } finally {
      await context.close();
    }
  }
}));
test('five empty pages offer continuation without declaring history exhausted', async () => scenario(async (browser, server) => {
  const rows = Array.from({
    length: 1900
  }, (_, i) => ({
    ...bridgeActions[0],
    global_sequence: String(i),
    trx_id: `long-${i}`
  }));
  const {
    context,
    controls,
    fixtures
  } = await setup(browser, server, '/?user=audituser', {
    bridgeActions: rows
  });
  try {
    await controls.getByRole('button', {
      name: 'Next',
      exact: true
    }).click();
    await controls.getByRole('button', {
      name: 'Continue searching older activity',
      exact: true
    }).waitFor();
    assert.deepEqual(offsets(fixtures), [0, 300, 600, 900, 1200, 1500]);
    await controls.getByRole('button', {
      name: 'Continue searching older activity',
      exact: true
    }).click();
    await controls.getByRole('button', {
      name: 'Last',
      exact: true
    }).waitFor();
    assert.deepEqual(offsets(fixtures), [0, 300, 600, 900, 1200, 1500, 1800]);
    await controls.getByText('Page 1 of 1', {
      exact: true
    }).waitFor();
  } finally {
    await context.close();
  }
}));
test('head-only polling retains shifted head and older rows; search reuses raw pages', async () => scenario(async (browser, server) => {
  let polls = 0;
  const newer = {
    ...bridgeActions[0],
    global_sequence: 'new-head',
    trx_id: 'new-head'
  };
  const {
    context,
    page,
    controls,
    fixtures
  } = await setup(browser, server, '/bridge', {
    bridgeResponse: skip => skip === 0 && ++polls > 1 ? {
      actions: [newer, ...bridgeActions.slice(0, 299)]
    } : undefined
  });
  try {
    await controls.getByRole('button', {
      name: 'Last loaded',
      exact: true
    }).click();
    await controls.getByRole('button', {
      name: 'Next',
      exact: true
    }).click();
    await controls.getByText('Page 11 of 20', {
      exact: true
    }).waitFor();
    await page.clock.runFor(125000);
    await page.waitForFunction(() => document.body.innerText.includes('Recent Bridge Activity'));
    await page.waitForTimeout(150);
    assert.deepEqual(offsets(fixtures), [0, 300, 0]);
    await page.getByPlaceholder(/Search/i).fill('audituser');
    await controls.getByText('Page 1 of 2', {
      exact: true
    }).waitFor();
    await page.locator('a[href*="synthetic-350"]').first().waitFor();
    assert.deepEqual(offsets(fixtures), [0, 300, 0]);
    await page.getByPlaceholder(/Search/i).fill('demowallet');
    await controls.getByRole('button', {
      name: 'First',
      exact: true
    }).click({
      force: true
    });
    await controls.getByRole('button', {
      name: 'Last loaded',
      exact: true
    }).click();
    await page.locator('a[href*="synthetic-599"]').first().waitFor();
    assert.deepEqual(offsets(fixtures), [0, 300, 0]);
    assert.deepEqual(fixtures.blocked, []);
  } finally {
    await context.close();
  }
}));
test('search cancels obsolete older scan and leaves new scan controls usable', async () => scenario(async (browser, server) => {
  let calls = 0;
  const {
    context,
    page,
    controls,
    fixtures
  } = await setup(browser, server, '/bridge', {
    bridgeResponse: async skip => {
      if (skip === 300 && ++calls === 1) await new Promise(resolve => setTimeout(resolve, 800));
    }
  });
  try {
    await controls.getByRole('button', {
      name: 'Last loaded',
      exact: true
    }).click();
    await controls.getByRole('button', {
      name: 'Next',
      exact: true
    }).click();
    await page.getByPlaceholder(/Search/i).fill('audituser');
    await controls.getByRole('button', {
      name: 'Next',
      exact: true
    }).waitFor();
    await controls.getByRole('button', {
      name: 'Next',
      exact: true
    }).click();
    await page.locator('a[href*="synthetic-350"]').first().waitFor();
    await page.waitForTimeout(900);
    await controls.getByText('Page 1 of 2', {
      exact: true
    }).waitFor();
    assert.equal(await controls.getByRole('button', {
      name: 'Next',
      exact: true
    }).isEnabled(), true);
    assert.deepEqual(fixtures.blocked, []);
  } finally {
    await context.close();
  }
}));
