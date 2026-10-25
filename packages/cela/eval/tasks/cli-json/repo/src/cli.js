'use strict';

const { stats } = require('./stats');

function main(argv, write) {
  const numbers = argv.map(Number);
  const s = stats(numbers);
  write(`count=${s.count} mean=${s.mean} min=${s.min} max=${s.max}\n`);
  return 0;
}

module.exports = { main };
