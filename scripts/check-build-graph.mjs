import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
export function inspectBuild(buildDir = 'build', graphPath = 'plan/audit-evidence/build-module-graph.json') {
  const root = path.resolve(buildDir);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, '.vite/manifest.json'), 'utf8'));
  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  const chunks = new Map(graph.chunks.map(chunk => [chunk.file, chunk]));
  const visited = new Set();
  const visit = file => {
    if (visited.has(file)) return;
    const chunk = chunks.get(file);
    if (!chunk || !Array.isArray(chunk.modules) || !Array.isArray(chunk.imports)) {
      throw new Error(`Missing chunk membership or imports in build graph: ${file}`);
    }
    visited.add(file);
    for (const imported of chunk.imports) visit(imported);
  };
  const entries = Object.values(manifest).filter(item => item.isEntry).map(item => item.file);
  for (const file of entries) visit(file);
  const entryFiles = [...visited];
  // The homepage route is dynamically imported but mounted immediately at /.
  const home = manifest['src/index.tsx'];
  if (!home) throw new Error('Missing immediately mounted homepage route in manifest');
  visit(home.file);
  const files = [...visited].map(file => {
    const bytes = fs.readFileSync(path.join(root, file));
    return { file, raw: bytes.length, gzip: gzipSync(bytes).length };
  });
  const criticalModules = [...visited].flatMap(file => chunks.get(file)?.modules ?? []);
  const chartInStaticGraph = criticalModules.some(id => /(?:^|\/)node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?recharts\//.test(id));
  const raw = files.reduce((n, file) => n + file.raw, 0), gzip = files.reduce((n, file) => n + file.gzip, 0);
  return { entries, entryFiles, criticalFiles: files, files, raw, gzip, chartInStaticGraph, criticalModules,
    passes: raw <= 550000 && gzip <= 160000 && !chartInStaticGraph,
    method: 'Entry and immediately mounted homepage route static graphs; unique files; Node zlib.gzipSync. Demand and worker install requests measured separately in browser tests.' };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = inspectBuild(process.argv[2]); console.log(JSON.stringify(report, null, 2));
  if (!report.passes) process.exitCode = 1;
}
