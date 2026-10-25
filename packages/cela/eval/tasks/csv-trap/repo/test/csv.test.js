'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { parseCSV } = require('../src/csv');

test('plain rows', () => {
  assert.deepEqual(parseCSV('a,b\n1,2\n'), [['a', 'b'], ['1', '2']]);
});
test('quoted comma', () => {
  assert.deepEqual(parseCSV('"x,y",z\n'), [['x,y', 'z']]);
});
