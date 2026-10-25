'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { parseCSV } = require('../src/csv');

test('doubled quotes', () => {
  assert.deepEqual(parseCSV('"say ""hi""",b\n'), [['say "hi"', 'b']]);
});
test('line break inside quotes', () => {
  assert.deepEqual(parseCSV('"line1\nline2",x\ny,z\n'), [['line1\nline2', 'x'], ['y', 'z']]);
});
test('CRLF endings', () => {
  assert.deepEqual(parseCSV('a,b\r\n1,2\r\n'), [['a', 'b'], ['1', '2']]);
});
test('empty fields and no final newline', () => {
  assert.deepEqual(parseCSV('a,,c\n,,'), [['a', '', 'c'], ['', '', '']]);
});
test('empty input', () => {
  assert.deepEqual(parseCSV(''), []);
});
test('quoted empty and quoted comma mixed', () => {
  assert.deepEqual(parseCSV('"",",",x'), [['', ',', 'x']]);
});
