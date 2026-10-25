'use strict';

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function retry(fn, { attempts = 3, baseMs = 100, sleep = defaultSleep } = {}) {
  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new RangeError('attempts must be an integer of at least 1');
  }
  let last;
  for (let n = 1; n <= attempts; n += 1) {
    try {
      return await fn(n);
    } catch (err) {
      last = err;
      if (n < attempts) await sleep(baseMs * 2 ** (n - 1));
    }
  }
  throw last;
}

module.exports = { retry };
