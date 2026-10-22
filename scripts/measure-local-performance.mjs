import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { gzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { startAuditServer } from './serve-audit-build.mjs';
import { installApiFixtures, seedStorage } from '../tests/fixtures/api.mjs';
import { inspectBuild } from './check-build-graph.mjs';
const viewports = [{
  width: 390,
  height: 844
}, {
  width: 768,
  height: 1024
}, {
  width: 1440,
  height: 1000
}];
const check = (value, message) => {
  if (!value) throw new Error(message);
};
const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
function staticPrecacheInventory() {
  const worker = fs.readFileSync('build/sw.js', 'utf8');
  const urls = [...worker.matchAll(/\{url:"([^"]+)",revision:/g)].map(match => match[1]);
  check(urls.length > 0, 'No precache URLs found in generated worker');
  const files = [...new Set(urls)].map(url => {
    const target = path.resolve('build', url);
    check(target.startsWith(path.resolve('build') + path.sep), 'Precache URL escaped build');
    const body = fs.readFileSync(target);
    return {
      url,
      raw: body.length,
      gzip: gzipSync(body).length,
      kind: url.endsWith('.js') ? 'js' : /\.(?:png|webp|svg|jpe?g|ico)$/.test(url) ? 'image' : 'other'
    };
  });
  const total = list => ({
    raw: list.reduce((n, file) => n + file.raw, 0),
    gzip: list.reduce((n, file) => n + file.gzip, 0)
  });
  return {
    urls: files.length,
    files,
    total: total(files),
    js: total(files.filter(file => file.kind === 'js')),
    images: total(files.filter(file => file.kind === 'image')),
    method: 'Actual build/sw.js precache URL inventory; body lengths and Node gzipSync. Inventory and observed request stages overlap and must not be summed.'
  };
}
function account(records, origin) {
  const files = [...new Set(records.filter(r => new URL(r.url).origin === origin).map(r => new URL(r.url).pathname.slice(1)))];
  const entries = files.filter(file => /\.(?:js|png|webp|svg|jpe?g|ico)$/.test(file)).map(file => {
    const target = path.resolve('build', file);
    check(target.startsWith(path.resolve('build') + path.sep), 'Asset path escaped build');
    const bytes = fs.readFileSync(target);
    return {
      file,
      kind: file.endsWith('.js') ? 'js' : 'image',
      raw: bytes.length,
      gzip: gzipSync(bytes).length
    };
  });
  const sum = kind => ({
    raw: entries.filter(e => e.kind === kind).reduce((n, e) => n + e.raw, 0),
    gzip: entries.filter(e => e.kind === kind).reduce((n, e) => n + e.gzip, 0)
  });
  return {
    requestCount: records.length,
    uniqueLocalFiles: entries,
    js: sum('js'),
    images: sum('image'),
    syntheticExternalImageRequests: records.filter(r => new URL(r.url).origin !== origin && r.resourceType === 'image').length,
    syntheticExternalImageBodies: {
      raw: records.filter(r => new URL(r.url).origin !== origin && r.resourceType === 'image').reduce((n, r) => n + (r.bodyRaw || 0), 0),
      gzip: records.filter(r => new URL(r.url).origin !== origin && r.resourceType === 'image').reduce((n, r) => n + (r.bodyGzip || 0), 0),
      note: 'Actual intercepted synthetic SVG response bodies, not production image traffic.'
    }
  };
}
export async function captureScenario(browser, origin, options = {}) {
  const context = await browser.newContext({
    viewport: options.viewport || viewports[2],
    deviceScaleFactor: 1,
    locale: 'en-US',
    serviceWorkers: options.sw ? 'allow' : 'block',
    reducedMotion: 'reduce'
  });
  const result = {
    name: options.name || 'homepage',
    condition: options.condition,
    repeat: options.repeat,
    viewport: options.viewport || viewports[2],
    delay: options.delay || 0,
    sw: !!options.sw,
    settings: {
      cpuRate: options.cpuRate || 1,
      latencyMs: options.latencyMs || 0,
      downloadMbps: options.downloadMbps || 0
    },
    errors: [],
    consoleErrors: [],
    navigations: [],
    documentRequests: [],
    allRequests: []
  };
  try {
    await seedStorage(context, options);
    await context.addInitScript(({
      sw
    }) => {
      if (!sw) delete Navigator.prototype.serviceWorker;
      // Hold installation until the untouched initial measurement has finished.
      if (sw) {
        window.__idleCallbacks = [];
        window.requestIdleCallback = callback => window.__idleCallbacks.push(callback);
        window.cancelIdleCallback = () => {};
        window.__releaseIdle = () => window.__idleCallbacks.splice(0).forEach(callback => callback({
          didTimeout: false,
          timeRemaining: () => 50
        }));
      }
      window.__audit = {
        cls: 0,
        cumulativeShift: 0,
        lcp: 0,
        longestTask: 0,
        shifts: []
      };
      let score = 0,
        start = 0,
        last = 0;
      for (const type of ['layout-shift', 'largest-contentful-paint', 'longtask']) try {
        new PerformanceObserver(list => {
          for (const e of list.getEntries()) {
            if (type === 'layout-shift' && !e.hadRecentInput) {
              if (e.startTime - last > 1000 || e.startTime - start > 5000) {
                score = 0;
                start = e.startTime;
              }
              score += e.value;
              last = e.startTime;
              window.__audit.cls = Math.max(window.__audit.cls, score);
              window.__audit.cumulativeShift += e.value;
              window.__audit.shifts.push({
                value: e.value,
                time: e.startTime,
                sources: (e.sources || []).map(s => ({
                  node: s.node?.tagName,
                  html: s.node?.outerHTML?.slice(0, 350),
                  previous: s.previousRect,
                  current: s.currentRect
                }))
              });
            }
            if (type === 'largest-contentful-paint') window.__audit.lcp = e.startTime;
            if (type === 'longtask') window.__audit.longestTask = Math.max(window.__audit.longestTask, e.duration);
          }
        }).observe({
          type,
          buffered: true
        });
      } catch {}
    }, {
      sw: !!options.sw
    });
    const fixture = await installApiFixtures(context, {
      ...options,
      origin
    });
    Object.assign(result, fixture);
    const pending = new Set(),
      records = new Map();
    const imageBodies = [];
    let stage = 'initial';
    context.on('request', request => {
      const record = {
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
        worker: !!request.serviceWorker(),
        stage
      };
      result.allRequests.push(record);
      records.set(request, record);
      pending.add(request);
    });
    context.on('requestfinished', request => pending.delete(request));
    context.on('response', response => {
      const request = response.request();
      if (request.resourceType() !== 'image' || new URL(request.url()).origin === origin) return;
      imageBodies.push(response.body().then(body => {
        const record = records.get(request);
        if (record) {
          record.bodyRaw = body.length;
          record.bodyGzip = gzipSync(body).length;
        }
      }).catch(error => {
        const record = records.get(request);
        if (record) record.bodyReadError = error.message;
      }));
    });
    context.on('requestfailed', request => {
      pending.delete(request);
      const record = records.get(request);
      if (record) record.failure = request.failure()?.errorText;
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on('pageerror', error => result.errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') result.consoleErrors.push(message.text().slice(0, 400));
    });
    page.on('request', request => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) result.documentRequests.push(request.url());
    });
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame()) result.navigations.push(frame.url());
    });
    const session = await context.newCDPSession(page);
    await session.send('Emulation.setCPUThrottlingRate', {
      rate: result.settings.cpuRate
    });
    if (options.latencyMs) await session.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: options.latencyMs,
      downloadThroughput: options.downloadMbps * 1000000 / 8,
      uploadThroughput: 750000 / 8
    });
    await page.goto(origin + (options.route || '/'), {
      waitUntil: 'load',
      timeout: 45000
    });
    const required = options.route === '/bridge' ? ['balance', 'table', 'raydium', 'history'] : options.route?.includes('user=') ? ['snapshot', 'table', 'history', 'dex'] : ['snapshot', 'table', 'balance', 'raydium', 'dex', 'xsol', 'newStakers', 'history'];
    // Failed lookup legitimately prevents child route hooks from mounting.
    const requiredKinds = options.fail === 'snapshot' ? ['snapshot'] : required;
    const deadline = Date.now() + 25000;
    while (requiredKinds.some(kind => !fixture.requests.some(r => r.kind === kind)) || pending.size) {
      check(Date.now() < deadline, 'Timed out waiting for every initial fixture request to finish');
      await page.waitForTimeout(50);
    }
    await page.waitForLoadState('networkidle', {
      timeout: 25000
    });
    if (!options.fail) {
      if (options.route === '/bridge') await page.getByRole('heading', {
        name: 'STRX Bridge Dashboard'
      }).waitFor();else if (options.route?.includes('user=')) await page.getByPlaceholder('Staked amount').waitFor();else await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="leaderboard-table"] tbody tr')].some(row => row.querySelector('td:not([colspan])')));
    }
    await frames(page);
    await page.waitForTimeout(500);
    await Promise.all(imageBodies);
    result.initialFixtureCompletion = {
      requiredKinds,
      pending: pending.size,
      apiRequests: fixture.requests.filter(r => r.kind).length
    };
    result.metrics = await page.evaluate(() => ({
      ...window.__audit,
      resources: performance.getEntriesByType('resource').map(r => ({
        name: r.name,
        transferSize: r.transferSize,
        encodedBodySize: r.encodedBodySize,
        initiatorType: r.initiatorType
      })),
      body: document.body.innerText.slice(0, 600),
      navigationCount: performance.getEntriesByType('navigation').length
    }));
    result.requestCount = fixture.requests.length; // Historical field includes fixture-intercepted images as well as APIs.
    result.apiRequestCount = fixture.requests.filter(r => r.kind).length;
    result.initialAllRequestCount = result.allRequests.length;
    result.documentNavigationCount = result.documentRequests.length;
    result.jsResources = result.metrics.resources.filter(r => /\.js(?:$|\?)/.test(r.name));
    result.bytes = {
      initial: account(result.allRequests, origin)
    };
    result.bytes.initial.syntheticExternalImages = {
      encoded: result.metrics.resources.filter(r => new URL(r.name).origin !== origin && r.initiatorType === 'img').reduce((n, r) => n + r.encodedBodySize, 0),
      note: 'Synthetic SVG responses; encodedBodySize may be zero without Timing-Allow-Origin. Real remote image bytes unmeasured.'
    };
    result.geometry = await (options.route ? page.locator('table').last() : page.getByTestId('leaderboard-table')).evaluate(table => ({
      rowCount: table.tBodies[0]?.rows.length,
      rowHeights: [...(table.tBodies[0]?.rows || [])].map(row => row.getBoundingClientRect().height),
      headers: [...table.querySelectorAll('th')].map(cell => ({
        text: cell.textContent,
        x: cell.getBoundingClientRect().x
      })),
      firstRow: [...(table.tBodies[0]?.rows[0]?.cells || [])].map(cell => ({
        text: cell.textContent,
        x: cell.getBoundingClientRect().x
      }))
    })).catch(() => null);
    result.header = await page.locator('header > div').evaluate(element => ({
      columns: getComputedStyle(element).gridTemplateColumns,
      children: [...element.children].map(child => ({
        text: child.textContent.slice(0, 50),
        y: child.getBoundingClientRect().y
      }))
    })).catch(() => null);
    if (options.outputDir) {
      fs.mkdirSync(options.outputDir, {
        recursive: true
      });
      result.screenshots = {
        viewport: path.join(options.outputDir, result.name + '-viewport.png'),
        full: path.join(options.outputDir, result.name + '.png')
      };
      await page.screenshot({
        path: result.screenshots.viewport,
        animations: 'disabled',
        timeout: 20000
      });
      await page.screenshot({
        path: result.screenshots.full,
        fullPage: true,
        animations: 'disabled',
        timeout: 20000
      });
    }
    if (options.sw) {
      stage = 'background';
      await page.evaluate(() => window.__releaseIdle());
      await page.waitForFunction(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        return registration?.active?.state === 'activated' && !!navigator.serviceWorker.controller;
      }, undefined, {
        timeout: 20000
      });
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(250);
      result.worker = await page.evaluate(async () => ({
        controlled: !!navigator.serviceWorker.controller,
        caches: await caches.keys(),
        precached: (await Promise.all((await caches.keys()).filter(name => name.includes('precache')).map(async name => (await (await caches.open(name)).keys()).map(r => new URL(r.url).pathname)))).flat()
      }));
      check(staticPrecacheInventory().files.every(file => result.worker.precached.includes('/' + file.url.replace(/^\//, ''))), 'Worker did not precache every declared static asset');
      result.bytes.background = account(result.allRequests.filter(r => r.worker), origin);
      check(result.bytes.background.js.raw > 0, 'Worker background JS not observed');
    } else if (!options.baseline && !options.route) {
      const initialScripts = result.allRequests.filter(r => r.resourceType === 'script').map(r => new URL(r.url).pathname.slice(1));
      const recharts = readJson('plan/audit-evidence/build-module-graph.json').chunks.filter(chunk => chunk.modules.some(id => /(?:^|[/\\])recharts(?:[/\\]|$)/.test(id))).map(chunk => chunk.file);
      const manifest = readJson('build/.vite/manifest.json');
      const chunkFor = fragment => Object.entries(manifest).find(([key, item]) => key.includes(fragment) || item.src?.includes(fragment))?.[1].file;
      const chartFile = chunkFor('StakersChart.tsx'),
        modalFile = chunkFor('InfoModal.tsx');
      check(chartFile && modalFile, 'Missing demand manifest entries');
      check(!initialScripts.some(file => recharts.includes(file) || file === chartFile || file === modalFile), 'Chart or closed modal JS loaded before demand');
      const critical = new Set(inspectBuild().criticalFiles.map(file => file.file));
      check(initialScripts.every(file => critical.has(file)), 'Initial script outside accounted critical graph');
      stage = 'chart-demand';
      await page.getByTestId('deferred-stakers-chart').scrollIntoViewIfNeeded();
      await page.getByTestId('deferred-stakers-chart').locator('.recharts-wrapper').waitFor();
      await page.waitForLoadState('networkidle');
      result.bytes.chartDemand = account(result.allRequests.filter(r => r.stage === stage), origin);
      check(result.bytes.chartDemand.js.raw > 0, 'Chart demand JS unobserved');
      stage = 'modal-demand';
      await page.evaluate(() => scrollTo(0, 0));
      await page.getByRole('button', {
        name: 'About STRX Staking Leaderboard'
      }).click();
      await page.getByRole('dialog').waitFor();
      await page.waitForLoadState('networkidle');
      result.bytes.modalDemand = account(result.allRequests.filter(r => r.stage === stage), origin);
      check(result.bytes.modalDemand.js.raw > 0, 'Modal demand JS unobserved');
      await page.getByRole('button', {
        name: 'Close dialog'
      }).click();
    }
    stage = 'interaction';
    const input = page.locator('input[type="text"],input[type="search"]').first();
    if (await input.count()) {
      const start = performance.now();
      await input.fill('audituser');
      await frames(page);
      result.interactionWallMs = performance.now() - start;
      result.interactionMethod = 'Node wall time from Playwright fill to two animation frames; includes automation overhead, not field INP';
    }
    result.allRequestCount = result.allRequests.length;
    result.documentNavigationCount = result.documentRequests.length;
    if (!options.baseline) {
      // The final acceptance gate includes bridge/profile diagnostics so route regressions cannot be hidden.
      check(result.metrics.cls <= .10, `CLS ${result.metrics.cls} > .10`);
      check(result.documentNavigationCount === 1, 'Unexpected document navigation/reload');
      check(!result.errors.length, 'Browser exception: ' + result.errors.join('; '));
      check(!result.consoleErrors.length, 'Console errors: ' + result.consoleErrors.join('; '));
      check(!result.blocked.length, 'Unexpected external request');
      if (!options.route) {
        check(result.bytes.initial.js.raw <= 550000 && result.bytes.initial.js.gzip <= 160000, 'Observed initial JS exceeds byte budget');
        check(result.geometry?.rowCount === 10 && result.geometry.rowHeights.every(height => height > 0), 'Homepage must render ten nonzero-height rows');
        check(result.geometry.firstRow.every((cell, index) => Math.abs(cell.x - result.geometry.headers[index].x) <= 2), 'Header/cell alignment exceeds 2 CSS px');
        check(result.header?.columns.split(' ').length === 2, 'Header must retain two grid tracks');
      }
    }
    result.status = options.baseline ? 'OBSERVED' : 'PASS';
  } catch (error) {
    result.status = /ERR_NETWORK_ACCESS_DENIED|ERR_CONNECTION_REFUSED/.test(error.message) ? 'UNRUN' : 'FAILED';
    result.failure = error.message;
  } finally {
    await context.close();
  }
  return result;
}
function aggregate(runs) {
  const fields = {
    cls: r => r.metrics?.cls,
    cumulativeShift: r => r.metrics?.cumulativeShift,
    lcpMs: r => r.metrics?.lcp,
    longestTaskMs: r => r.metrics?.longestTask,
    interactionWallMs: r => r.interactionWallMs,
    initialRequests: r => r.initialAllRequestCount,
    apiRequests: r => r.apiRequestCount
  };
  for (const stage of ['initial', 'chartDemand', 'modalDemand', 'background']) for (const kind of ['js', 'images']) for (const size of ['raw', 'gzip']) fields[stage + '_' + kind + '_' + size] = r => r.bytes?.[stage]?.[kind]?.[size];
  for (const stage of ['initial', 'chartDemand', 'modalDemand', 'background']) fields[stage + '_requests'] = r => r.bytes?.[stage]?.requestCount;
  return [...new Set(runs.map(r => r.condition))].map(condition => ({
    condition,
    runs: runs.filter(r => r.condition === condition).length,
    metrics: Object.fromEntries(Object.entries(fields).map(([key, read]) => {
      const values = runs.filter(r => r.condition === condition).map(read).filter(Number.isFinite).sort((a, b) => a - b);
      return [key, values.length ? {
        samples: values.length,
        median: values[Math.floor(values.length / 2)],
        maximum: Math.max(...values)
      } : null];
    }))
  }));
}
export async function measureLocalPerformance({
  outputDir,
  baseline = false
} = {}) {
  outputDir ||= baseline ? 'plan/audit-evidence/current-observations' : 'plan/audit-evidence/final';
  fs.mkdirSync(outputDir, {
    recursive: true
  });
  const report = {
    environment: 'Local production build with synthetic API fixtures; no field performance claims',
    machine: {
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      cpu: os.cpus()[0]?.model
    },
    build: inspectBuild(),
    staticPrecacheInventory: staticPrecacheInventory(),
    runs: [],
    method: {
      cold: 'New isolated browser context per run; Playwright routing disables HTTP cache; SW blocked except installation runs',
      cls: 'Maximum layout-shift session: gap <=1000ms and window <=5000ms, excluding recent input; cumulativeShift preserves the older sum definition.',
      settle: 'Required fixture kinds observed, requests completed, network idle, rendered route, two frames and 500ms without input; screenshots before interaction.',
      bytes: 'Unique local build bodies by observed request stage, raw filesystem length and Node zlib.gzipSync. Worker requests separate and may overlap initial graph. Computed gzip is not wire transfer.',
      baseline: 'Original baseline/*.json read-only; single historical requestCount includes fixture-intercepted API and image requests; API counts derived using request.kind.'
    },
    limitations: ['CDP throttling is diagnostic; route-fulfilled API bodies bypass real API latency. Local static downloads are throttled.', 'Interaction samples include Playwright overhead, not field INP.', 'Synthetic external images may expose zero timing sizes; real API latency and production image bytes unmeasured.', 'TEST-021 installed offline behavior is verified by the final service-worker browser suite; this script measures first-install background traffic.', 'Original baseline executable/version metadata was not retained; exact historical browser parity cannot be proved. No production Core Web Vitals or vulnerability-free claim.']
  };
  let server, browser;
  try {
    server = await startAuditServer();
    browser = await chromium.launch({
      headless: true,
      args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--disable-background-networking', `--log-file=${path.resolve(outputDir, 'chromium.log')}`],
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      } : {})
    });
    report.browser = {
      version: browser.version(),
      executable: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || chromium.executablePath()
    };
    const scenarios = baseline ? [{
      name: 'desktop'
    }, {
      name: 'mobile',
      viewport: viewports[0]
    }, {
      name: 'bridge',
      route: '/bridge'
    }, {
      name: 'profile',
      route: '/?user=audituser'
    }, {
      name: 'empty-apr',
      emptyApr: true
    }, {
      name: 'corrupt-storage',
      corruptStorage: true
    }, {
      name: 'snapshot-503',
      route: '/?user=audituser',
      fail: 'snapshot'
    }, {
      name: 'bridge-503',
      route: '/bridge',
      fail: 'history'
    }, {
      name: 'first-install',
      sw: true
    }] : [];
    if (!baseline) {
      check(report.build.passes, 'PER-001/002: critical byte/module gate failed');
      for (const viewport of viewports) for (const delay of [0, 300, 1000]) for (let repeat = 1; repeat <= 3; repeat++) scenarios.push({
        name: `cls-${viewport.width}-${delay}-${repeat}`,
        condition: `cls-${viewport.width}-${delay}`,
        viewport,
        delay,
        repeat,
        delayByKind: {
          snapshot: delay,
          table: delay * 2,
          newStakers: delay * 3,
          history: delay * 2,
          raydium: delay * 3,
          dex: delay * 2,
          xsol: delay * 3,
          balance: delay
        }
      });
      for (const scenario of [{
        name: 'desktop'
      }, {
        name: 'bridge',
        route: '/bridge'
      }, {
        name: 'profile',
        route: '/?user=audituser'
      }, {
        name: 'throttled',
        cpuRate: 4,
        latencyMs: 150,
        downloadMbps: 1.6
      }, {
        name: 'first-install',
        sw: true
      }]) for (let repeat = 1; repeat <= 3; repeat++) scenarios.push({
        ...scenario,
        name: scenario.name + '-' + repeat,
        condition: scenario.name,
        repeat
      });
    }
    for (const scenario of scenarios) {
      report.runs.push(await captureScenario(browser, server.origin, {
        ...scenario,
        baseline,
        outputDir
      }));
      fs.writeFileSync(path.join(outputDir, baseline ? 'observations.json' : 'performance.json'), JSON.stringify(report, null, 2));
      if (report.runs.at(-1).status === 'UNRUN') break;
    }
    report.summaries = aggregate(report.runs);
    report.status = report.runs.some(r => r.status === 'UNRUN') ? 'UNRUN' : report.runs.every(r => r.status === (baseline ? 'OBSERVED' : 'PASS')) ? baseline ? 'OBSERVED' : 'PASS' : 'FAILED';
    if (!baseline) {
      const old = readJson('plan/audit-evidence/baseline/performance.json');
      report.comparison = {
        baselineBuild: {
          raw: old.build.raw,
          gzip: old.build.gzip
        },
        finalBuild: {
          raw: report.build.raw,
          gzip: report.build.gzip
        },
        baselineSingleObservations: old.runs.map(r => ({
          name: r.name,
          cumulativeShift: r.metrics?.cls,
          lcp: r.metrics?.lcp,
          fixtureRequests: r.requestCount,
          apiRequests: r.requests.filter(q => q.kind).length,
          interactionWallMs: r.interactionWallMs
        })),
        interpretation: 'Body sizes use the same gzip method; final cumulativeShift permits comparison with the old shift sum. Repetitions, settling and final session CLS differ: no paired or production speed percentage inferred.'
      };
    }
  } catch (error) {
    report.status = report.runs.length ? 'FAILED' : 'UNRUN';
    report.reason = error.message;
  } finally {
    await browser?.close();
    await server?.close();
  }
  fs.writeFileSync(path.join(outputDir, baseline ? 'observations.json' : 'performance.json'), JSON.stringify(report, null, 2));
  if (['FAILED', 'UNRUN'].includes(report.status)) process.exitCode = 1;
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await measureLocalPerformance();
  console.log(JSON.stringify({
    status: report.status,
    runs: report.runs.length,
    failed: report.runs.filter(r => ['FAILED', 'UNRUN'].includes(r.status)).map(r => ({
      name: r.name,
      status: r.status,
      failure: r.failure
    })),
    summaries: report.summaries,
    reason: report.reason
  }, null, 2));
}
