'use strict';

function stats(numbers) {
  const count = numbers.length;
  const sum = numbers.reduce((a, b) => a + b, 0);
  return {
    count,
    mean: sum / count,
    min: Math.min(...numbers),
    max: Math.max(...numbers),
  };
}

module.exports = { stats };
