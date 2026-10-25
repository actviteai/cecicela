'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { main } = require('../src/cli');

test('prints text stats', () => {
  let out = '';
  const code = main(['1', '2', '3'], (s) => { out += s; });
  assert.equal(code, 0);
  assert.equal(out, 'count=3 mean=2 min=1 max=3\n');
});
