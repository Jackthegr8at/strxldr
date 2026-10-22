import test from 'node:test';
import assert from 'node:assert/strict';
import { readSectionVisibility, writeSectionVisibility } from '../../src/lib/preferences.ts';
export const phase = 3;
const defaults = {
  recentActivity: true,
  newStakers: true,
  tierMilestones: true
};
const custom = {
  recentActivity: false,
  newStakers: true,
  tierMilestones: false
};
test('legacy and versioned preferences sanitize keys; writes are versioned', () => {
  for (const value of [custom, {
    version: 1,
    value: {
      ...custom,
      extra: 1
    }
  }]) assert.deepEqual(readSectionVisibility({
    getItem: () => JSON.stringify(value)
  }), custom);
  let saved;
  writeSectionVisibility({
    setItem: (key, value) => {
      assert.equal(key, 'sectionVisibility');
      saved = JSON.parse(value);
    }
  }, custom);
  assert.deepEqual(saved, {
    version: 1,
    value: custom
  });
});
test('missing, corrupt, wrong shape/version and inaccessible storage default safely', () => {
  for (const raw of [null, '{', 'null', '[]', '{}', JSON.stringify({
    recentActivity: false
  }), JSON.stringify({
    ...custom,
    newStakers: 'yes'
  }), JSON.stringify({
    version: 2,
    value: custom
  })]) assert.deepEqual(readSectionVisibility({
    getItem: () => raw
  }), defaults);
  const denied = {
    getItem() {
      throw Error('denied');
    },
    setItem() {
      throw Error('quota');
    }
  };
  assert.deepEqual(readSectionVisibility(denied), defaults);
  assert.doesNotThrow(() => writeSectionVisibility(denied, custom));
});
