'use strict';

const UNITS = { d: 86400000, h: 3600000, m: 60000, s: 1000, ms: 1 };
const ORDER = ['d', 'h', 'm', 's', 'ms'];

function parseDuration(text) {
  const input = String(text).trim();
  if (/^\d+(\.\d+)?$/.test(input)) return Number(input);
  const part = /(\d+(?:\.\d+)?)(ms|d|h|m|s)\s*/iy;
  let total = 0;
  let rank = -1;
  let parts = 0;
  part.lastIndex = 0;
  while (part.lastIndex < input.length) {
    const m = part.exec(input);
    if (!m) throw new RangeError(`invalid duration: ${text}`);
    const unit = m[2].toLowerCase();
    const next = ORDER.indexOf(unit);
    if (next <= rank) throw new RangeError(`invalid duration: ${text}`);
    rank = next;
    total += Number(m[1]) * UNITS[unit];
    parts += 1;
  }
  if (parts === 0) throw new RangeError(`invalid duration: ${text}`);
  return total;
}

module.exports = { parseDuration };
