import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const args = process.argv.slice(2),
  mode = args[0] || 'all';
const phaseIndex = args.indexOf('--phase');
const phase = phaseIndex < 0 ? Infinity : Number(args[phaseIndex + 1]);
if (!['unit', 'browser', 'baseline', 'all'].includes(mode) || !(phase > 0)) throw new Error('Usage: run-local-tests.mjs unit|browser|baseline|all [--phase N]');
const files = [];
for (const category of ['unit', 'browser']) {
  if (mode !== 'all' && mode !== category && !(mode === 'baseline' && category === 'browser')) continue;
  const dir = path.join('tests', category);
  if (!fs.existsSync(dir)) continue;
  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.endsWith('.test.mjs')) continue;
    const file = path.join(dir, name),
      source = fs.readFileSync(file, 'utf8');
    const declared = Number(source.match(/(?:export\s+const\s+phase\s*=|phase\s*:)\s*(\d+)/)?.[1] || 1);
    if (mode === 'baseline' && !name.startsWith('audit-baseline')) continue;
    if (mode !== 'baseline' && name.startsWith('audit-baseline')) continue;
    if (declared <= phase) files.push(file);
  }
}
if (!files.length) {
  console.log(`No applicable ${mode} tests through phase ${phase}; no acceptance assertions claimed.`);
  process.exit(0);
}
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], {
  stdio: 'inherit',
  env: {
    ...process.env,
    AUDIT_MODE: mode,
    AUDIT_PHASE: String(phase)
  }
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
