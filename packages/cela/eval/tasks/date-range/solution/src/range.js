'use strict';

const DAY = 24 * 60 * 60 * 1000;

function parse(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (!m) throw new TypeError(`invalid date: ${value}`);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(y, mo - 1, d);
  const back = new Date(ms);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) {
    throw new TypeError(`invalid date: ${value}`);
  }
  return ms;
}

function dateRange(start, end) {
  const first = parse(start);
  const last = parse(end);
  const out = [];
  for (let t = first; t <= last; t += DAY) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

module.exports = { dateRange };
