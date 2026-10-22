import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startAuditServer } from '../../scripts/serve-audit-build.mjs';
import { installApiFixtures, snapshot } from '../fixtures/api.mjs';
export const phase = 6;
const CACHE_KEY = 'strxldr:swr-cache:v3';
const evidence = path.resolve('plan/audit-evidence');
async function scenario(run) {
  await fs.mkdir(evidence, {
    recursive: true
  });
  const buildDir = await fs.mkdtemp(path.join(evidence, 'worker-build-'));
  await fs.cp('build', buildDir, {
    recursive: true
  });
  const originalWorker = await fs.readFile(path.join(buildDir, 'sw.js'), 'utf8');
  const setVersion = version => fs.writeFile(path.join(buildDir, 'sw.js'), `${originalWorker}\nself.__auditVersion=${JSON.stringify(version)};self.addEventListener('message',event=>{if(event.data==='audit-version'&&event.ports[0])event.ports[0].postMessage(self.__auditVersion);});\n`);
  await setVersion('one');
  const server = await startAuditServer({
    buildDir,
    port: 4176
  });
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--disable-background-networking', `--log-file=${path.join(evidence, 'phase6-worker-chromium.log')}`]
    });
    const context = await browser.newContext({
      serviceWorkers: 'allow',
      locale: 'en-US'
    });
    const options = {
      origin: server.origin
    };
    const fixtures = await installApiFixtures(context, options);
    const workerRequests = [];
    context.on('request', request => {
      if (request.serviceWorker()) workerRequests.push({
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType()
      });
    });
    let offline = false;
    await context.route('**/*', route => offline && new URL(route.request().url()).origin !== server.origin ? route.abort('internetdisconnected') : route.fallback());
    await context.addInitScript(() => {
      if (!navigator.serviceWorker) return;
      window.__auditRegistration = [];
      window.__auditIdle = [];
      window.__auditUpdateTimers = new Set();
      const interval = window.setInterval.bind(window),
        clear = window.clearInterval.bind(window);
      window.setInterval = (callback, delay, ...args) => {
        const id = interval(callback, delay, ...args);
        if (delay === 1800000) window.__auditUpdateTimers.add(id);
        return id;
      };
      window.clearInterval = id => {
        window.__auditUpdateTimers.delete(id);
        return clear(id);
      };
      const register = navigator.serviceWorker.register.bind(navigator.serviceWorker);
      navigator.serviceWorker.register = (...args) => {
        window.__auditRegistration.push({
          url: args[0],
          time: performance.now(),
          loaded: document.readyState
        });
        return register(...args);
      };
      window.requestIdleCallback = (callback, options) => {
        window.__auditIdle.push({
          callback,
          timeout: options?.timeout
        });
        return window.__auditIdle.length;
      };
      window.cancelIdleCallback = () => {};
      window.__releaseAuditIdle = () => {
        window.__auditIdle.splice(0).forEach(({
          callback
        }) => callback({
          didTimeout: false,
          timeRemaining: () => 50
        }));
      };
    });
    const errors = [];
    context.on('page', page => {
      page.setDefaultTimeout(15000);
      page.on('pageerror', error => errors.push(error.message));
    });
    const goOffline = async () => {
      offline = true;
      await context.setOffline(true);
    };
    await run({
      context,
      origin: server.origin,
      fixtures,
      options,
      setVersion,
      buildDir,
      goOffline,
      workerRequests
    });
    assert.deepEqual(fixtures.blocked, []);
    assert.deepEqual(errors, []);
    await context.close();
  } finally {
    await browser?.close();
    await server.close();
    const relative = path.relative(evidence, buildDir);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Unsafe temporary build cleanup path');
    await fs.rm(buildDir, {
      recursive: true,
      force: true
    });
  }
}
async function ready(page) {
  await page.evaluate(() => window.__releaseAuditIdle());
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (registration.active.state !== 'activated') await new Promise(resolve => registration.active.addEventListener('statechange', () => {
      if (registration.active?.state === 'activated') resolve();
    }));
    if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, {
      once: true
    }));
  });
}
async function version(page, which = 'active') {
  return page.evaluate(async which => {
    const registration = await navigator.serviceWorker.getRegistration();
    const channel = new MessageChannel();
    const result = new Promise(resolve => {
      channel.port1.onmessage = event => resolve(event.data);
    });
    registration[which].postMessage('audit-version', [channel.port2]);
    return result;
  }, which);
}
const bridgeRequests = fixtures => fixtures.requests.filter(request => request.url.endsWith('/v2/history/get_actions') && request.query.account === 'bridge.strx');
const snapshotRequests = fixtures => fixtures.requests.filter(request => request.url.endsWith('/STRX/stakes.json'));
async function profile(page, origin) {
  await page.goto(origin + '/?user=audituser');
  await page.getByPlaceholder('Staked amount').waitFor();
}
test('installation defers until load and idle, keeps one document navigation and precaches every static chunk', async () => scenario(async ({
  context,
  origin,
  fixtures,
  buildDir,
  workerRequests
}) => {
  const page = await context.newPage();
  let documents = 0;
  page.on('request', request => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents++;
  });
  await page.goto(origin + '/bridge');
  await page.getByRole('heading', {
    name: 'STRX Bridge Dashboard'
  }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.__auditRegistration), []);
  assert.equal(await page.evaluate(() => window.__auditIdle[0]?.timeout), 5000);
  await ready(page);
  await page.waitForTimeout(150);
  const registrations = await page.evaluate(() => window.__auditRegistration);
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0].loaded, 'complete');
  assert.equal(new URL(registrations[0].url, origin).search, '');
  assert.equal(documents, 1);
  assert.equal(bridgeRequests(fixtures).length, 1);
  const api = fixtures.requests.filter(request => request.method === 'POST' || request.url.includes('raydium.io'));
  assert.equal(api.length, 3);
  const precached = await page.evaluate(async () => {
    const names = await caches.keys();
    const urls = [];
    for (const name of names) if (name.includes('precache')) urls.push(...(await (await caches.open(name)).keys()).map(request => new URL(request.url).pathname));
    return urls;
  });
  const chunks = (await fs.readdir(path.join(buildDir, 'assets'))).filter(name => name.endsWith('.js'));
  for (const name of chunks) assert.ok(precached.includes('/assets/' + name), `precache includes ${name}`);
  const backgroundJs = workerRequests.filter(request => new URL(request.url).pathname.endsWith('.js'));
  let backgroundJsRawBytes = 0;
  for (const request of backgroundJs) backgroundJsRawBytes += (await fs.stat(path.join(buildDir, new URL(request.url).pathname))).size;
  assert.ok(backgroundJs.length > 0, 'worker background precache requests are observable');
  await fs.writeFile(path.join(evidence, 'phase6-static-precache.json'), JSON.stringify({
    chunks: chunks.length,
    precached,
    documents,
    apiRequests: api.length,
    bridgeHistoryRequests: bridgeRequests(fixtures).length,
    backgroundJsRawBytes,
    backgroundJs
  }, null, 2));
}));
test('two controlled tabs keep update waiting without reload, then activate after old tabs close and preserve unrelated caches', async () => scenario(async ({
  context,
  origin,
  setVersion
}) => {
  const first = await context.newPage();
  await first.goto(origin + '/bridge');
  await ready(first);
  await first.evaluate(async () => {
    await (await caches.open('audit-unrelated-sentinel')).put('/audit-sentinel', new Response('keep'));
  });
  const second = await context.newPage();
  await second.goto(origin + '/bridge');
  await ready(second);
  let firstReloads = 0,
    secondReloads = 0;
  first.on('framenavigated', frame => {
    if (frame === first.mainFrame()) firstReloads++;
  });
  second.on('framenavigated', frame => {
    if (frame === second.mainFrame()) secondReloads++;
  });
  assert.equal(await version(first), 'one');
  assert.equal(await version(second), 'one');
  await setVersion('two');
  await first.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration()).update();
  });
  await first.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting);
  assert.equal(await version(first, 'waiting'), 'two');
  assert.equal(await version(first), 'one');
  assert.equal(await version(second), 'one');
  assert.equal(firstReloads, 0);
  assert.equal(secondReloads, 0);
  await first.close();
  await second.close();
  const reopened = await context.newPage();
  await reopened.goto(origin + '/bridge');
  await ready(reopened);
  assert.equal(await version(reopened), 'two');
  assert.equal(await reopened.evaluate(async () => await (await caches.open('audit-unrelated-sentinel')).match('/audit-sentinel').then(response => response?.text())), 'keep');
}));
test('controlled first online GET revalidation delivers changed snapshot without an API cache read', async () => scenario(async ({
  context,
  origin,
  fixtures,
  options
}) => {
  const page = await context.newPage();
  await page.clock.install();
  await profile(page, origin);
  await ready(page);
  assert.equal(await page.getByPlaceholder('Staked amount').inputValue(), '1000000');
  options.snapshot = {
    ...snapshot,
    audituser: {
      staked: 2000000,
      unstaked: 100
    }
  };
  const before = snapshotRequests(fixtures).length;
  await page.clock.runFor(121000);
  await page.waitForFunction(() => document.querySelector('input[placeholder="Staked amount"]')?.value === '2000000');
  assert.equal(snapshotRequests(fixtures).length, before + 1);
  const cachedApi = await page.evaluate(async () => {
    const results = [];
    for (const name of await caches.keys()) for (const request of await (await caches.open(name)).keys()) if (new URL(request.url).hostname !== '127.0.0.1') results.push(request.url);
    return results;
  });
  assert.deepEqual(cachedApi, []);
}));
test('installed shell and all routes reopen offline with cached labels; expired data exposes Retry without invented financial zeroes', async () => scenario(async ({
  context,
  origin,
  goOffline
}) => {
  const warm = await context.newPage();
  await warm.goto(origin + '/');
  await warm.getByPlaceholder('Search by username...').waitFor();
  await ready(warm);
  await warm.goto(origin + '/bridge');
  await warm.getByRole('heading', {
    name: 'STRX Bridge Dashboard'
  }).waitFor();
  await profile(warm, origin);
  await warm.evaluate(() => dispatchEvent(new Event('pagehide')));
  await warm.close();
  await goOffline();
  for (const route of ['/', '/bridge', '/?user=audituser']) {
    const page = await context.newPage();
    await page.goto(origin + route);
    await page.getByText(/Showing cached data/).first().waitFor();
    if (route === '/') await page.getByPlaceholder('Search by username...').waitFor();else if (route === '/bridge') await page.getByRole('heading', {
      name: 'STRX Bridge Dashboard'
    }).waitFor();else {
      await page.getByPlaceholder('Staked amount').waitFor();
      assert.equal(await page.getByPlaceholder('Staked amount').inputValue(), '1000000');
    }
    assert.doesNotMatch(await page.locator('body').innerText(), /NaN|Infinity|Something went wrong/);
    await page.close();
  }
  const expired = await context.newPage();
  await expired.addInitScript(key => {
    const envelope = JSON.parse(localStorage.getItem(key));
    for (const [, entry] of envelope.entries) entry.fetchedAt = Date.now() - 600000;
    localStorage.setItem(key, JSON.stringify(envelope));
  }, CACHE_KEY);
  await expired.goto(origin + '/?user=audituser');
  await expired.getByRole('button', {
    name: 'Retry',
    exact: true
  }).first().waitFor();
  assert.equal(await expired.getByPlaceholder('Staked amount').count(), 0);
  assert.equal(await expired.getByRole('heading', {
    name: "audituser's Profile",
    exact: true
  }).count(), 0);
  assert.match(await expired.locator('body').innerText(), /Unable to load data/);
}));
test('synthetic persisted pageshow resumes one worker update timer after pagehide without duplicate scheduling', async () => scenario(async ({
  context,
  origin
}) => {
  const page = await context.newPage();
  await page.goto(origin + '/bridge');
  await ready(page);
  assert.equal(await page.evaluate(() => window.__auditUpdateTimers.size), 1);
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide', {
    persisted: true
  })));
  assert.equal(await page.evaluate(() => window.__auditUpdateTimers.size), 0);
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', {
    persisted: true
  })));
  await ready(page);
  await page.waitForFunction(() => window.__auditUpdateTimers.size === 1);
  assert.equal(await page.evaluate(() => window.__auditRegistration.length), 2);
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', {
    persisted: true
  })));
  await page.evaluate(() => window.__releaseAuditIdle());
  await page.waitForTimeout(50);
  assert.equal(await page.evaluate(() => window.__auditUpdateTimers.size), 1);
  assert.equal(await page.evaluate(() => window.__auditRegistration.length), 2);
}));
