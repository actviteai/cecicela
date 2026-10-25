'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { parseDuration } = require('../src/duration');

test('every unit', () => {
  assert.equal(parseDuration('7ms'), 7);
  assert.equal(parseDuration('3h'), 10800000);
  assert.equal(parseDuration('2d'), 172800000);
});
test('compound durations', () => {
  assert.equal(parseDuration('1h30m'), 5400000);
  assert.equal(parseDuration('1h 30m'), 5400000);
  assert.equal(parseDuration('2d 4h 5m 6s 7ms'), 187506007);
});
test('decimals, case, whitespace, bare numbers', () => {
  assert.equal(parseDuration('1.5h'), 5400000);
  assert.equal(parseDuration('1H'), 3600000);
  assert.equal(parseDuration('  90s '), 90000);
  assert.equal(parseDuration('250'), 250);
});
test('invalid input throws RangeError', () => {
  for (const bad of ['', '5x', '1h-', '-5s', 'h', '1m1h', '1h1h', '1.h', '1h 30']) {
    assert.throws(() => parseDuration(bad), RangeError, bad);
  }
});
