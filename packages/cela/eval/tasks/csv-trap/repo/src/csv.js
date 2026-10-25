'use strict';

function parseCSV(text) {
  return text
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => line.split(','));
}

module.exports = { parseCSV };
