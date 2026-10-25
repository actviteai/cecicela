'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { retry } = require('../src/retry');

test('returns the first success', async () => {
  let calls = 0;
  const value = await retry(async () => { calls += 1; return 'ok'; }, { sleep: async () => {} });
  assert.equal(value, 'ok');
  assert.equal(calls, 1);
});
