'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { retry } = require('../src/retry');

function recorder() {
  const waits = [];
  const sleep = async (ms) => { waits.push(ms); };
  return { waits, sleep };
}

test('succeeds on a later attempt with exponential waits', async () => {
  const { waits, sleep } = recorder();
  const seen = [];
  const value = await retry(async (n) => {
    seen.push(n);
    if (n < 3) throw new Error(`fail ${n}`);
    return n;
  }, { attempts: 4, sleep });
  assert.equal(value, 3);
  assert.deepEqual(seen, [1, 2, 3]);
  assert.deepEqual(waits, [100, 200]);
});

test('rejects with the last error and does not sleep after the last attempt', async () => {
  const { waits, sleep } = recorder();
  let calls = 0;
  await assert.rejects(
    retry(async () => { calls += 1; throw new Error(`boom ${calls}`); }, { attempts: 3, baseMs: 10, sleep }),
    /boom 3/,
  );
  assert.equal(calls, 3);
  assert.deepEqual(waits, [10, 20]);
});

test('single attempt never sleeps', async () => {
  const { waits, sleep } = recorder();
  await assert.rejects(retry(async () => { throw new Error('x'); }, { attempts: 1, sleep }), /x/);
  assert.deepEqual(waits, []);
});

test('invalid attempts reject with RangeError', async () => {
  for (const attempts of [0, -1, 1.5, '3']) {
    await assert.rejects(retry(async () => 1, { attempts, sleep: async () => {} }), RangeError);
  }
});
