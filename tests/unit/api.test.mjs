import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchJson, fetchStakeSnapshot, fetchHistoryActions, getXprEndpoint } from '../../src/lib/api.ts';
export const phase = 3;
const valid = {
  audituser: {
    staked: 1000000,
    unstaked: 100
  }
};
function stub(t, implementation) {
  const previous = globalThis.fetch;
  globalThis.fetch = implementation;
  t.after(() => {
    globalThis.fetch = previous;
  });
}
const response = (data, headers = {}) => ({
  ok: true,
  headers: new Headers(headers),
  json: async () => data
});
test('HTTP and JSON failures propagate; a later retry succeeds', async t => {
  let call = 0;
  stub(t, async () => {
    call++;
    if (call === 1) return {
      ok: false,
      status: 503
    };
    if (call === 2) return {
      ok: true,
      json: async () => {
        throw new SyntaxError('bad JSON');
      }
    };
    return response({
      ok: true
    });
  });
  await assert.rejects(fetchJson('https://synthetic.invalid'), /503/);
  await assert.rejects(fetchJson('https://synthetic.invalid'), /bad JSON/);
  assert.deepEqual(await fetchJson('https://synthetic.invalid'), {
    ok: true
  });
});
test('10000ms deadline rejects a noncooperative fetch and aborts its signal', async t => {
  t.mock.timers.enable({
    apis: ['setTimeout']
  });
  let signal;
  stub(t, (_url, init) => {
    signal = init.signal;
    return new Promise(() => {});
  });
  const pending = fetchJson('https://synthetic.invalid');
  const rejection = assert.rejects(pending, {
    name: 'TimeoutError'
  });
  t.mock.timers.tick(9999);
  assert.equal(signal.aborted, false);
  t.mock.timers.tick(1);
  await rejection;
  assert.equal(signal.aborted, true);
});
test('deadline also covers stalled response.json after headers arrive', async t => {
  t.mock.timers.enable({
    apis: ['setTimeout']
  });
  let started = false;
  stub(t, async () => ({
    ok: true,
    headers: new Headers(),
    json: () => {
      started = true;
      return new Promise(() => {});
    }
  }));
  const pending = fetchJson('https://synthetic.invalid');
  await Promise.resolve();
  assert.equal(started, true);
  const rejection = assert.rejects(pending, {
    name: 'TimeoutError'
  });
  t.mock.timers.tick(10000);
  await rejection;
});
test('caller abort cancels pending body; listeners and deadline are cleaned on success', async t => {
  const caller = new AbortController();
  let additions = 0,
    removals = 0;
  const add = caller.signal.addEventListener.bind(caller.signal);
  const remove = caller.signal.removeEventListener.bind(caller.signal);
  caller.signal.addEventListener = (...args) => {
    additions++;
    return add(...args);
  };
  caller.signal.removeEventListener = (...args) => {
    removals++;
    return remove(...args);
  };
  stub(t, async () => ({
    ok: true,
    headers: new Headers(),
    json: () => new Promise(() => {})
  }));
  const pending = fetchJson('https://synthetic.invalid', {
    signal: caller.signal
  });
  caller.abort();
  await assert.rejects(pending, {
    name: 'AbortError'
  });
  assert.equal(additions, removals);
  let seenSignal;
  globalThis.fetch = async (_url, init) => {
    seenSignal = init.signal;
    return response({
      ok: true
    });
  };
  t.mock.timers.enable({
    apis: ['setTimeout']
  });
  const successCaller = new AbortController();
  await fetchJson('https://synthetic.invalid', {
    signal: successCaller.signal
  });
  t.mock.timers.tick(10000);
  successCaller.abort();
  assert.equal(seenSignal.aborted, false, 'removed caller listener and cleared deadline cannot abort completed request');
});
test('already-aborted caller makes no fetch', async t => {
  let calls = 0;
  stub(t, async () => {
    calls++;
    return response({});
  });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(fetchJson('https://synthetic.invalid', {
    signal: controller.signal
  }), {
    name: 'AbortError'
  });
  assert.equal(calls, 0);
});
test('snapshot source age is nullable and retrieval time comes from successful body resolution', async t => {
  stub(t, async () => response(valid));
  for (const header of [undefined, '', 'nonsense']) {
    globalThis.fetch = async () => response(valid, header === undefined ? {} : {
      'last-modified': header
    });
    const before = Date.now();
    const result = await fetchStakeSnapshot();
    assert.equal(result.lastModified, null);
    assert.ok(result.fetchedAt >= before && result.fetchedAt <= Date.now());
    assert.deepEqual(result.data, valid);
  }
  globalThis.fetch = async () => response(valid, {
    'last-modified': '2026-10-20T00:00:00Z'
  });
  assert.equal((await fetchStakeSnapshot()).lastModified, '2026-10-20T00:00:00.000Z');
});
test('malformed snapshot entries are rejected; empty snapshots and zero values are valid', async t => {
  stub(t, async () => response(valid));
  for (const data of [null, [], 4, {
    bad: null
  }, {
    bad: []
  }, {
    bad: {
      staked: -1,
      unstaked: 0
    }
  }, {
    bad: {
      staked: 1
    }
  }, {
    bad: {
      staked: '1',
      unstaked: 0
    }
  }, {
    bad: {
      staked: Infinity,
      unstaked: 0
    }
  }, {
    bad: {
      staked: 0,
      unstaked: NaN
    }
  }]) {
    globalThis.fetch = async () => response(data);
    await assert.rejects(fetchStakeSnapshot(), /Invalid stake snapshot/);
  }
  for (const data of [{}, {
    zero: {
      staked: 0,
      unstaked: 0
    }
  }]) {
    globalThis.fetch = async () => response(data);
    assert.deepEqual((await fetchStakeSnapshot()).data, data);
  }
});
test('native import uses fallback endpoint; history preserves parameters and caller init', async t => {
  assert.equal(getXprEndpoint(), 'https://proton.eosusa.io');
  let captured;
  stub(t, async (url, init) => {
    captured = {
      url,
      init
    };
    return response({
      actions: []
    });
  });
  const signal = new AbortController().signal;
  await fetchHistoryActions({
    skip: 300,
    limit: 30
  }, 'bridge.strx', {
    signal,
    headers: {
      'x-synthetic': 'yes'
    }
  });
  const url = new URL(captured.url);
  assert.equal(url.searchParams.get('account'), 'bridge.strx');
  assert.equal(url.searchParams.get('skip'), '300');
  assert.equal(url.searchParams.get('limit'), '30');
  assert.equal(captured.init.headers['x-synthetic'], 'yes');
  assert.ok(captured.init.signal instanceof AbortSignal);
});
