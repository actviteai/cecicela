'use strict';

const { stats } = require('./stats');

function main(argv, write) {
  let json = false;
  const numbers = [];
  for (const arg of argv) {
    if (arg === '--json') {
      json = true;
      continue;
    }
    const n = Number(arg);
    if (arg.trim() === '' || !Number.isFinite(n)) {
      write(`error: not a number: ${arg}\n`);
      return 2;
    }
    numbers.push(n);
  }
  if (numbers.length === 0) {
    write(json ? `${JSON.stringify({ count: 0, mean: null, min: null, max: null })}\n` : 'count=0\n');
    return 0;
  }
  const s = stats(numbers);
  write(json ? `${JSON.stringify(s)}\n` : `count=${s.count} mean=${s.mean} min=${s.min} max=${s.max}\n`);
  return 0;
}

module.exports = { main };
