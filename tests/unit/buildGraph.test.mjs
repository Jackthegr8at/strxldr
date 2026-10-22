import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectBuild } from '../../scripts/check-build-graph.mjs';

export const phase = 6;
test('critical graph includes the homepage and detects Recharts despite renamed chunks', t => {
  const evidence = path.resolve('plan/audit-evidence');
  fs.mkdirSync(evidence, { recursive: true });
  const root = fs.mkdtempSync(path.join(evidence, 'graph-test-'));
  t.after(() => {
    assert.ok(root.startsWith(evidence + path.sep));
    fs.rmSync(root, { recursive: true, force: true });
  });
  fs.mkdirSync(path.join(root, '.vite'));
  fs.mkdirSync(path.join(root, 'assets'));
  const names = ['entry', 'home', 'renamed'];
  for (const name of names) fs.writeFileSync(path.join(root, 'assets', name + '.js'), 'export {};');
  fs.writeFileSync(path.join(root, '.vite/manifest.json'), JSON.stringify({
    'src/main.tsx': { file: 'assets/entry.js', isEntry: true },
    'src/index.tsx': { file: 'assets/home.js' },
  }));
  const graph = { chunks: names.map(name => ({
    file: `assets/${name}.js`, imports: [], dynamicImports: [],
    modules: [name === 'renamed' ? 'node_modules/recharts/lib/chart.js' : `src/${name}.tsx`],
  })) };
  const graphPath = path.join(root, 'graph.json');
  const inspect = () => {
    fs.writeFileSync(graphPath, JSON.stringify(graph));
    return inspectBuild(root, graphPath);
  };
  graph.chunks[1].dynamicImports.push('assets/renamed.js');
  assert.equal(inspect().passes, true, 'demand-only chart is outside critical bytes');
  graph.chunks[1].imports.push('assets/renamed.js');
  const eager = inspect();
  assert.equal(eager.chartInStaticGraph, true);
  assert.equal(eager.passes, false);
  assert.ok(eager.files.some(file => file.file === 'assets/home.js'));
  graph.chunks.pop();
  assert.throws(inspect, /Missing chunk membership/, 'an incomplete graph cannot silently pass');
});
