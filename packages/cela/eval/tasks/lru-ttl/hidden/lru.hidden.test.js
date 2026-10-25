'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { LRU } = require('../src/lru');

function clock() {
  let t = 1000;
  const now = () => t;
  now.advance = (ms) => { t += ms; };
  return now;
}

test('entries expire after ttlMs', () => {
  const now = clock();
  const c = new LRU(3, { ttlMs: 100, now });
  c.set('a', 1);
  now.advance(99);
  assert.equal(c.get('a'), 1);
  now.advance(1);
  assert.equal(c.get('a'), undefined);
  assert.equal(c.has('a'), false);
});

test('size ignores expired entries', () => {
  const now = clock();
  const c = new LRU(3, { ttlMs: 50, now });
  c.set('a', 1);
  now.advance(30);
  c.set('b', 2);
  now.advance(30);
  assert.equal(c.size, 1);
  assert.equal(c.has('b'), true);
});

test('get does not extend lifetime but set does', () => {
  const now = clock();
  const c = new LRU(3, { ttlMs: 100, now });
  c.set('a', 1);
  now.advance(60);
  c.get('a');
  now.advance(60);
  assert.equal(c.has('a'), false);
  c.set('b', 1);
  now.advance(60);
  c.set('b', 2);
  now.advance(60);
  assert.equal(c.get('b'), 2);
});

test('LRU eviction still applies with ttl', () => {
  const now = clock();
  const c = new LRU(2, { ttlMs: 1000, now });
  c.set('a', 1).set('b', 2);
  c.get('a');
  c.set('c', 3);
  assert.equal(c.has('b'), false);
  assert.equal(c.get('a'), 1);
});

test('no ttl keeps entries forever', () => {
  const c = new LRU(2);
  c.set('a', 1);
  assert.equal(c.get('a'), 1);
  assert.equal(c.size, 1);
});

test('defaults to Date.now', () => {
  const c = new LRU(2, { ttlMs: 60000 });
  c.set('a', 1);
  assert.equal(c.get('a'), 1);
});
