#!/usr/bin/env node
'use strict';
/**
 * Compare two eval runs by their hidden-test pass/fail sets, not their scores:
 * live models vary run to run, but a behaviour-neutral change must not move a
 * (task, agent, condition) group from passing to failing.
 *
 *   node eval/compare.js <baseline-dir> <candidate-dir>
 *
 * A group passes when the majority of its runs passed the hidden tests. Groups
 * present in only one run are listed and ignored. Exits 1 when any shared group
 * changed state.
 */
const path = require('path');
const { load } = require('./report');

function groups(rows) {
  const out = new Map();
  for (const r of rows) {
    if (r.error) continue;
    const key = `${r.task} | ${r.agent} | ${r.condition}`;
    const g = out.get(key) || { pass: 0, runs: 0 };
    g.runs += 1;
    if (r.hiddenPass) g.pass += 1;
    out.set(key, g);
  }
  return new Map([...out].map(([k, g]) => [k, { ...g, passes: g.pass * 2 > g.runs }]));
}

function compare(baseRows, candRows) {
  const a = groups(baseRows);
  const b = groups(candRows);
  const changed = [];
  const onlyA = [];
  const onlyB = [];
  for (const [k, g] of a) {
    if (!b.has(k)) onlyA.push(k);
    else if (b.get(k).passes !== g.passes) changed.push({ group: k, before: g, after: b.get(k) });
  }
  for (const k of b.keys()) if (!a.has(k)) onlyB.push(k);
  return { shared: [...a.keys()].filter((k) => b.has(k)).length, changed, onlyA, onlyB };
}

function main(argv) {
  if (argv.length !== 2) {
    process.stderr.write('usage: node eval/compare.js <baseline-dir> <candidate-dir>\n');
    return 2;
  }
  const [base, cand] = argv.map((d) => path.resolve(d));
  const res = compare(load(base), load(cand));
  const fmt = (g) => `${g.pass}/${g.runs} ${g.passes ? 'pass' : 'FAIL'}`;
  process.stdout.write(`${res.shared} shared groups (task | agent | condition); ${res.changed.length} changed.\n`);
  for (const c of res.changed) process.stdout.write(`  CHANGED ${c.group}: ${fmt(c.before)} -> ${fmt(c.after)}\n`);
  for (const k of res.onlyA) process.stdout.write(`  only in baseline: ${k}\n`);
  for (const k of res.onlyB) process.stdout.write(`  only in candidate: ${k}\n`);
  if (!res.shared) {
    process.stdout.write('No shared groups: run the candidate with the baseline\'s agents and conditions.\n');
    return 1;
  }
  return res.changed.length ? 1 : 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { compare, groups };
