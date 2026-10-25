'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { main } = require('../src/cli');

function run(argv) {
  let out = '';
  const code = main(argv, (s) => { out += s; });
  return { code, out };
}

test('json output', () => {
  assert.deepEqual(run(['--json', '1', '2', '3']), { code: 0, out: '{"count":3,"mean":2,"min":1,"max":3}\n' });
});
test('flag position does not matter', () => {
  assert.deepEqual(run(['4', '--json', '6']), { code: 0, out: '{"count":2,"mean":5,"min":4,"max":6}\n' });
});
test('empty input', () => {
  assert.deepEqual(run([]), { code: 0, out: 'count=0\n' });
  assert.deepEqual(run(['--json']), { code: 0, out: '{"count":0,"mean":null,"min":null,"max":null}\n' });
});
test('non-numbers are rejected in both modes', () => {
  assert.deepEqual(run(['1', 'x']), { code: 2, out: 'error: not a number: x\n' });
  assert.deepEqual(run(['--json', 'NaN']), { code: 2, out: 'error: not a number: NaN\n' });
  assert.deepEqual(run(['--jsn', '1']), { code: 2, out: 'error: not a number: --jsn\n' });
  assert.deepEqual(run(['Infinity']), { code: 2, out: 'error: not a number: Infinity\n' });
});
test('text format unchanged', () => {
  assert.deepEqual(run(['1.5', '2.5']), { code: 0, out: 'count=2 mean=2 min=1.5 max=2.5\n' });
});
