'use strict';

function dateRange(start, end) {
  const out = [];
  const d = new Date(start);
  const last = new Date(end);
  while (d < last) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

module.exports = { dateRange };
