import test from 'node:test';
import assert from 'node:assert/strict';
import { createPersistentCache, CACHE_KEY } from '../../src/lib/swrCache.ts';
import { snapshotKey, userBalanceKey } from '../../src/lib/queryKeys.ts';
export const phase = 3;
const key = snapshotKey();
const value = {
  data: {
    audituser: {
      staked: 1,
      unstaked: 0
    }
  },
  lastModified: null,
  fetchedAt: 1000
};
function fixture(raw) {
  let saved = raw;
  const events = new EventTarget();
  const storage = {
    getItem: name => name === CACHE_KEY ? saved : null,
    setItem: (name, data) => {
      assert.equal(name, CACHE_KEY);
      saved = data;
    }
  };
  return {
    storage,
    events,
    saved: () => JSON.parse(saved),
    flush: () => events.dispatchEvent(new Event('pagehide'))
  };
}
test('success owns age and identical values notify; SWR state flags never renew persistence', () => {
  let time = 1000;
  const f = fixture(),
    cache = createPersistentCache({
      storage: f.storage,
      eventTarget: f.events,
      now: () => time
    });
  let notifications = 0;
  const unsubscribe = cache.subscribe(() => notifications++);
  cache.recordSuccess(value, key);
  time = 2000;
  cache.recordSuccess(value, key);
  assert.equal(notifications, 2);
  unsubscribe();
  cache.provider().set(key, {
    data: 'transient',
    error: new Error('failed'),
    isValidating: true
  });
  time = 700000;
  f.flush();
  f.flush();
  assert.deepEqual(f.saved(), {
    version: 3,
    entries: [[key, {
      data: value,
      fetchedAt: 2000
    }]]
  });
  assert.equal(cache.getFetchedAt(key), 2000);
  assert.equal(createPersistentCache({
    storage: f.storage,
    now: () => time
  }).provider().size, 0);
});
test('TTL boundaries, future dates and malformed envelopes are rejected', () => {
  const envelope = fetchedAt => JSON.stringify({
    version: 3,
    entries: [[key, {
      data: value,
      fetchedAt
    }]]
  });
  for (const [age, accepted] of [[0, true], [299999, true], [300000, false], [-1, false]]) {
    const f = fixture(envelope(500000 - age));
    assert.equal(createPersistentCache({
      storage: f.storage,
      now: () => 500000
    }).provider().has(key), accepted);
  }
  for (const raw of ['{', 'null', '{}', '[]', JSON.stringify({
    version: 2,
    entries: []
  }), JSON.stringify({
    version: 3,
    entries: [[key, null], [key, {
      data: null,
      fetchedAt: 1
    }], [key, {
      data: 1,
      fetchedAt: '1'
    }], ['legacy', {
      data: 1,
      fetchedAt: 1
    }], [userBalanceKey('a', 'jack'), {
      data: 1,
      fetchedAt: 1
    }]]
  })]) {
    const f = fixture(raw);
    assert.equal(createPersistentCache({
      storage: f.storage,
      now: () => 2
    }).provider().size, 0);
  }
});
test('trusted aliases record and restore legacy hooks while only canonical keys persist', () => {
  const f = fixture(),
    options = {
      storage: f.storage,
      now: () => 1000,
      eventTarget: f.events,
      aliases: {
        stakes_snapshot: key
      }
    };
  const cache = createPersistentCache(options);
  cache.recordSuccess(value, 'stakes_snapshot');
  cache.recordSuccess('private', userBalanceKey('a', 'jack'));
  cache.recordSuccess('untrusted', 'unknown');
  f.flush();
  assert.deepEqual(f.saved().entries, [[key, {
    data: value,
    fetchedAt: 1000
  }]]);
  const restored = createPersistentCache(options);
  assert.deepEqual(restored.provider().get('stakes_snapshot'), {
    data: value
  });
  assert.deepEqual(restored.provider().get(key), {
    data: value
  });
  assert.equal(restored.getFetchedAt('stakes_snapshot'), 1000);
  assert.equal(restored.isRestored(key), true);
  let resolutions = 0;
  restored.subscribe(() => resolutions++);
  restored.recordSuccess(value, key);
  assert.equal(restored.isRestored(key), false);
  assert.equal(resolutions, 1, 'identical successful data clears restored status even at the same timestamp');
});
test('denied/quota storage, old unversioned cache and hidden flush remain safe', () => {
  const events = new EventTarget();
  events.visibilityState = 'hidden';
  let writes = 0;
  const denied = {
    getItem() {
      throw Error('denied');
    },
    setItem() {
      writes++;
      throw Error('quota');
    }
  };
  const cache = createPersistentCache({
    storage: denied,
    eventTarget: events,
    now: () => 10
  });
  cache.recordSuccess(value, key);
  events.dispatchEvent(new Event('visibilitychange'));
  assert.equal(writes, 1);
  cache.provider().set('session', {
    data: 1
  });
  assert.equal(cache.provider().get('session').data, 1);
  const old = fixture(JSON.stringify({
    [key]: {
      data: value,
      timestamp: 10
    }
  }));
  assert.equal(createPersistentCache({
    storage: old.storage
  }).provider().size, 0);
});
test('malformed successful resource data cannot enter restored financial state', () => {
  for (const data of ['bad', {}, {
    data: {
      audituser: {
        staked: 'bad',
        unstaked: 0
      }
    },
    lastModified: null,
    fetchedAt: 1
  }, {
    data: {},
    lastModified: 'bad',
    fetchedAt: 1
  }]) {
    const f = fixture(JSON.stringify({
      version: 3,
      entries: [[key, {
        data,
        fetchedAt: 1
      }]]
    }));
    const cache = createPersistentCache({
      storage: f.storage,
      eventTarget: f.events,
      now: () => 2
    });
    assert.equal(cache.provider().size, 0);
    cache.recordSuccess(data, key);
    f.flush();
    assert.deepEqual(f.saved().entries, []);
  }
});
test('config and price rows must contain fields consumed by dashboard code', () => {
  for (const [resource, data] of [['config', {rows: []}], ['config', {
    rows: [{}]
  }], ['oraclePrices', {
    rows: [{}]
  }], ['config', Promise.resolve(1)], ['config', new Error('bad')]]) {
    const invalidKey = JSON.stringify(['strxldr:v3', resource, 'endpoint']);
    const f = fixture(JSON.stringify({
      version: 3,
      entries: [[invalidKey, {
        data,
        fetchedAt: 1
      }]]
    }));
    const cache = createPersistentCache({
      storage: f.storage,
      eventTarget: f.events,
      now: () => 2
    });
    assert.equal(cache.provider().size, 0);
    cache.recordSuccess(data, invalidKey);
    f.flush();
    assert.deepEqual(f.saved().entries, []);
  }
});
