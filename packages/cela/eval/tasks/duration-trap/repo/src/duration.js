'use strict';

function parseDuration(text) {
  const m = /^(\d+)(s|m)$/.exec(text);
  if (!m) throw new RangeError(`invalid duration: ${text}`);
  return Number(m[1]) * (m[2] === 's' ? 1000 : 60000);
}

module.exports = { parseDuration };
