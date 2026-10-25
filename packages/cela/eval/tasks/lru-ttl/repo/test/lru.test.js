'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { LRU } = require('../src/lru');

test('evicts the least recently used entry', () => {
  const c = new LRU(2);
  c.set('a', 1).set('b', 2);
  c.get('a');
  c.set('c', 3);
  assert.equal(c.has('b'), false);
  assert.equal(c.get('a'), 1);
  assert.equal(c.size, 2);
});
