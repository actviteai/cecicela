'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { slugify } = require('../src/slugify');

test('lowercases and hyphenates words', () => {
  assert.equal(slugify('Hello World'), 'hello-world');
});
