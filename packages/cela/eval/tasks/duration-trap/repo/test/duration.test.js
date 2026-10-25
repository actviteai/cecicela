'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { parseDuration } = require('../src/duration');

test('seconds and minutes', () => {
  assert.equal(parseDuration('90s'), 90000);
  assert.equal(parseDuration('2m'), 120000);
});
test('garbage throws', () => {
  assert.throws(() => parseDuration('abc'), RangeError);
});
