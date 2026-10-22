import test from 'node:test';
import assert from 'node:assert/strict';
import { measureLocalPerformance } from '../../scripts/measure-local-performance.mjs';
export const phase = 1;
test('capture baseline observations (does not assert any audit finding repaired)', async () => {
  const report = await measureLocalPerformance({
    baseline: true
  });
  assert.notEqual(report.status, 'UNRUN', report.reason);
  assert.ok(report.runs.length === 9, 'all nine baseline scenarios captured');
  assert.ok(report.runs.every(r => r.status === 'OBSERVED'), JSON.stringify(report.runs.filter(r => r.status !== 'OBSERVED')));
  assert.ok(report.runs.every(r => r.blocked.length === 0), 'unexpected remote requests must be reviewed');
});
