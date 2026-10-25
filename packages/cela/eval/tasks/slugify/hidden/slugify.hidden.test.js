'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { slugify } = require('../src/slugify');

test('example from the report', () => {
  assert.equal(slugify('  Crème Brûlée -- Recipe! '), 'creme-brulee-recipe');
});
test('accents are stripped', () => {
  assert.equal(slugify('Ünïcödé 2024'), 'unicode-2024');
});
test('runs of separators collapse', () => {
  assert.equal(slugify('a__b\t\tc...d'), 'a-b-c-d');
});
test('no leading or trailing hyphen', () => {
  assert.equal(slugify('---Hi---'), 'hi');
  assert.equal(slugify('!!!'), '');
  assert.equal(slugify(''), '');
});
