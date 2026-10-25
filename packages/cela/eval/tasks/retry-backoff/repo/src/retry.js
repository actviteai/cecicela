'use strict';

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function retry(fn, { attempts = 3, baseMs = 100, sleep = defaultSleep } = {}) {
  for (let i = 0; i <= attempts; i++) {
    try {
      return await fn(i);
    } catch (err) {
      await sleep(baseMs * i);
    }
  }
}

module.exports = { retry };
