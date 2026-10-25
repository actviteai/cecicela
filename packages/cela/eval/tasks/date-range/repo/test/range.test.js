'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { dateRange } = require('../src/range');

test('includes the end date', () => {
  assert.deepEqual(dateRange('2024-01-01', '2024-01-03'), ['2024-01-01', '2024-01-02', '2024-01-03']);
});
