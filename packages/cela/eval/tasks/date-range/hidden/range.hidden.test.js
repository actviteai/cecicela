'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { dateRange } = require('../src/range');

test('single day', () => {
  assert.deepEqual(dateRange('2024-05-05', '2024-05-05'), ['2024-05-05']);
});
test('leap day and month boundary', () => {
  assert.deepEqual(dateRange('2024-02-28', '2024-03-01'), ['2024-02-28', '2024-02-29', '2024-03-01']);
});
test('year boundary', () => {
  assert.deepEqual(dateRange('2023-12-31', '2024-01-01'), ['2023-12-31', '2024-01-01']);
});
test('DST change week', () => {
  const days = dateRange('2024-03-08', '2024-03-12');
  assert.deepEqual(days, ['2024-03-08', '2024-03-09', '2024-03-10', '2024-03-11', '2024-03-12']);
  assert.deepEqual(dateRange('2024-10-26', '2024-10-28'), ['2024-10-26', '2024-10-27', '2024-10-28']);
});
test('reversed range is empty', () => {
  assert.deepEqual(dateRange('2024-01-05', '2024-01-01'), []);
});
test('invalid dates throw TypeError', () => {
  assert.throws(() => dateRange('2024-13-01', '2024-12-01'), TypeError);
  assert.throws(() => dateRange('2024-01-01', 'soon'), TypeError);
  assert.throws(() => dateRange('2023-02-29', '2023-03-01'), TypeError);
});
