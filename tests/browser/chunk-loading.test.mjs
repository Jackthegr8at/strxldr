import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startAuditServer } from '../../scripts/serve-audit-build.mjs';
import { inspectBuild } from '../../scripts/check-build-graph.mjs';
import { installApiFixtures } from '../fixtures/api.mjs';
export const phase = 6;
const manifest = () => JSON.parse(fs.readFileSync('build/.vite/manifest.json', 'utf8'));
function chunkFor(fragment) {
  const entry = Object.entries(manifest()).find(([key, value]) => key.includes(fragment) || value.src?.includes(fragment));
  assert.ok(entry, `manifest includes ${fragment}`);
  return entry[1].file;
}
const launch = () => chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--disable-background-networking', `--log-file=${path.resolve('plan/audit-evidence/phase6-chunk-chromium.log')}`] });
async function scenario(run, { noObserver = false } = {}) {
  const server = await startAuditServer({ port: 4177 });
  let browser;
  try {
    browser = await launch();
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width:1440, height:1000 }, locale:'en-US' });
    await context.addInitScript(noObserver => {
      delete Navigator.prototype.serviceWorker;
      if (noObserver) delete window.IntersectionObserver;
    }, noObserver);
    const fixtures = await installApiFixtures(context, { origin:server.origin });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const requests = [], errors = [];
    page.on('request', request => { if (request.resourceType() === 'script') requests.push(new URL(request.url()).pathname.replace(/^\//, '')); });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(server.origin);
    await page.getByRole('button', { name:'About STRX Staking Leaderboard' }).waitFor();
    await page.getByText('Reward APR:', {exact:false}).waitFor();
    await run({page, requests, fixtures, server});
    assert.deepEqual(errors, []);
    assert.deepEqual(fixtures.blocked, []);
    await context.close();
  } finally { await browser?.close(); await server.close(); }
}
test('critical homepage graph satisfies byte budgets and excludes Recharts modules', () => {
  const result = inspectBuild();
  assert.ok(result.raw <= 550000, `critical raw ${result.raw} <= 550000`);
  assert.ok(result.gzip <= 160000, `critical gzip ${result.gzip} <= 160000`);
  assert.equal(result.chartInStaticGraph, false);
  const graph = JSON.parse(fs.readFileSync('plan/audit-evidence/build-module-graph.json', 'utf8'));
  const criticalNames = new Set((result.criticalFiles ?? result.files).map(item => typeof item === 'string' ? item : item.file));
  const criticalModules = graph.chunks.filter(chunk => criticalNames.has(chunk.file)).flatMap(chunk => chunk.modules);
  assert.ok(criticalModules.length > 0, 'local module graph records critical source membership');
  assert.equal(criticalModules.some(module => /(?:^|[/\\])recharts(?:[/\\]|$)/i.test(module)), false, 'Recharts cannot be hidden in a renamed critical chunk');
  const home = manifest()['src/index.tsx'];
  assert.ok(home, 'homepage dynamic route manifest entry exists');
  const critical = result.criticalFiles ?? result.files;
  assert.ok(critical.some(item => (typeof item === 'string' ? item : item.file) === home.file), 'budget includes immediately mounted homepage');
});
test('offscreen chart and closed modal request no demand JS, then each loads once when requested', async () => scenario(async ({page, requests}) => {
  const chartFile = chunkFor('StakersChart.tsx'), modalFile = chunkFor('InfoModal.tsx');
  const graph = JSON.parse(fs.readFileSync('plan/audit-evidence/build-module-graph.json', 'utf8'));
  const rechartsFiles = graph.chunks.filter(chunk => chunk.modules.some(module => /(?:^|[/\\])recharts(?:[/\\]|$)/i.test(module))).map(chunk => chunk.file);
  assert.ok(rechartsFiles.length > 0, 'identify every Recharts-containing chunk from actual module membership');
  const account = files => {
    const unique = [...new Set(files)];
    const entries = unique.map(file => { const bytes = fs.readFileSync(path.join('build', file)); return { file, raw: bytes.length, gzip: gzipSync(bytes).length }; });
    return { requests: files.length, uniqueFiles: entries, raw: entries.reduce((total, item) => total + item.raw, 0), gzip: entries.reduce((total, item) => total + item.gzip, 0) };
  };
  const chart = page.getByTestId('deferred-stakers-chart');
  await chart.waitFor();
  const bounds = await chart.boundingBox();
  assert.ok(bounds.height >= 300, `reserved chart height ${bounds.height}`);
  assert.ok(bounds.y >= 1200, `chart below 200px viewport eligibility: y=${bounds.y}`);
  await page.waitForLoadState('networkidle');
  assert.equal(requests.filter(file => file === chartFile).length, 0);
  assert.equal(requests.filter(file => file === modalFile).length, 0);
  const initialRequests = [...requests];
  assert.deepEqual(initialRequests.filter(file => rechartsFiles.includes(file)), [], 'all Recharts-containing chunks absent before eligibility');
  const criticalNames = new Set(inspectBuild().criticalFiles.map(item => item.file));
  assert.deepEqual(initialRequests.filter(file => !criticalNames.has(file)), [], 'all actually requested initial scripts belong to the accounted critical graph');
  const initial = account(initialRequests);
  assert.ok(initial.raw <= 550000 && initial.gzip <= 160000, 'actual initial JS also satisfies critical byte limits');
  // Enter the declared 200px root margin without requiring the chart to be visible.
  await page.evaluate(y => window.scrollTo(0, y - innerHeight - 150), bounds.y);
  await page.waitForFunction(file => performance.getEntriesByType('resource').some(entry => new URL(entry.name).pathname.endsWith(file)), chartFile);
  await chart.locator('.recharts-wrapper').waitFor();
  await page.waitForLoadState('networkidle');
  const chartRequests = requests.slice(initialRequests.length);
  const chartDemand = account(chartRequests);
  assert.ok(chartDemand.raw > 0 && chartRequests.includes(chartFile), 'chart demand records actual extra network JS');
  const preModalRequestCount = requests.length;
  await page.evaluate(() => window.scrollTo(0, 0));
  await chart.scrollIntoViewIfNeeded();
  assert.equal(requests.filter(file => file === chartFile).length, 1);
  await page.evaluate(() => window.scrollTo(0, 0));
  const opener = page.getByRole('button', {name:'About STRX Staking Leaderboard'});
  await opener.focus(); await opener.press('Enter');
  await page.getByRole('dialog').waitFor();
  assert.equal(requests.filter(file => file === modalFile).length, 1);
  await page.waitForLoadState('networkidle');
  const modalDemand = account(requests.slice(preModalRequestCount));
  assert.ok(modalDemand.raw > 0, 'modal demand records actual extra network JS');
  fs.mkdirSync('plan/audit-evidence', { recursive: true });
  fs.writeFileSync('plan/audit-evidence/phase6-demand-loading.json', JSON.stringify({ method: 'Actual browser script request paths; unique local build files per stage; Node zlib.gzipSync. SW disabled; CSS excluded; worker background bytes recorded separately.', initial, chartDemand, modalDemand, rechartsFiles }, null, 2));
  await page.getByRole('button', {name:'Close dialog'}).click();
  await page.getByRole('dialog').waitFor({state:'detached'});
  assert.equal(await opener.evaluate(node => document.activeElement === node), true);
  await opener.click(); await page.getByRole('dialog').waitFor();
  assert.equal(requests.filter(file => file === modalFile).length, 1);
}));
test('missing IntersectionObserver eagerly mounts a usable chart', async () => scenario(async ({page,requests}) => {
  const chartFile = chunkFor('StakersChart.tsx');
  await page.getByTestId('deferred-stakers-chart').locator('.recharts-wrapper').waitFor();
  assert.equal(requests.filter(file => file === chartFile).length, 1);
}, {noObserver:true}));
