#!/usr/bin/env node
'use strict';

/**
 * Summarize eval results.
 *
 *   node eval/report.js eval/results/<run>            # prints markdown
 *   node eval/report.js eval/results/<run> --write    # also writes report.md there
 *
 * false-DONE rate is the headline: runs that ended with "STATUS: DONE"
 * while the hidden tests failed, over all runs in the group.
 */

const fs = require('fs');
const path = require('path');

function load(dir) {
  const file = path.join(dir, 'results.jsonl');
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : '–');
const mean = (xs) => {
  const vals = xs.filter((x) => typeof x === 'number');
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
};
const fmt = (x, digits = 0) => (x == null ? '–' : x.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits }));

function group(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

function summaryRow(label, rows) {
  const ok = rows.filter((r) => !r.error);
  const n = rows.length;
  return [
    label,
    n,
    pct(ok.filter((r) => r.hiddenPass).length, n),
    pct(ok.filter((r) => r.falseDone).length, n),
    pct(ok.filter((r) => r.claimed === 'DONE').length, n),
    pct(ok.filter((r) => r.claimed === 'MISSING').length, n),
    fmt(mean(ok.map((r) => (r.tokensIn || 0) + (r.tokensOut || 0)))),
    fmt(mean(ok.map((r) => r.tokensOut))),
    fmt(mean(ok.map((r) => r.costUsd)), 2),
    fmt(mean(ok.map((r) => r.turns)), 1),
    fmt(mean(ok.map((r) => r.durationMs / 1000))),
    rows.length - ok.length,
  ];
}

function table(header, rows) {
  const line = (cells) => `| ${cells.join(' | ')} |`;
  return [line(header), line(header.map(() => '---')), ...rows.map(line)].join('\n');
}

function report(dir) {
  const rows = load(dir);
  const agents = [...new Set(rows.map((r) => r.agent))].sort();
  const conditions = ['none', 'lean', 'full'].filter((c) => rows.some((r) => r.condition === c));
  const tasks = [...new Set(rows.map((r) => r.task))].sort();
  const header = ['group', 'runs', 'hidden pass', 'false DONE', 'claimed DONE', 'no status', 'tokens (in+out)', 'tokens out', 'cost $', 'turns', 'seconds', 'errors'];
  const out = [];
  // Runs recorded before the rename carry the engine version under its old key; any *Version field names it.
  const versionKey = rows.length ? Object.keys(rows.find((r) => Object.keys(r).some((k) => /Version$/.test(k))) || {}).find((k) => /Version$/.test(k)) : null;
  const version = (versionKey && rows.find((r) => r[versionKey])?.[versionKey]) || 'unknown';
  out.push(`# cela eval — ${path.basename(dir)}`, '', `cela ${version}. ${rows.length} runs, ${tasks.length} tasks. Hidden tests run with TZ=America/New_York.`, '');

  out.push('## By condition (all agents)', '');
  out.push(table(header, conditions.map((c) => summaryRow(c, rows.filter((r) => r.condition === c)))), '');

  out.push('## By agent and condition', '');
  const byAgent = [];
  for (const a of agents) {
    for (const c of conditions) {
      const subset = rows.filter((r) => r.agent === a && r.condition === c);
      if (subset.length) byAgent.push(summaryRow(`${a} / ${c}`, subset));
    }
  }
  out.push(table(header, byAgent), '');

  out.push('## Trap tasks only', '');
  out.push(table(header, conditions.map((c) => summaryRow(c, rows.filter((r) => r.condition === c && r.kind === 'trap')))), '');

  out.push('## Hidden-test pass by task', '');
  const taskHeader = ['task', 'kind', ...conditions];
  const taskRows = tasks.map((t) => {
    const kind = rows.find((r) => r.task === t).kind;
    return [t, kind, ...conditions.map((c) => {
      const subset = rows.filter((r) => r.task === t && r.condition === c);
      const passed = subset.filter((r) => r.hiddenPass).length;
      const falseDone = subset.filter((r) => r.falseDone).length;
      return `${passed}/${subset.length}${falseDone ? ` (${falseDone} false DONE)` : ''}`;
    })];
  });
  out.push(table(taskHeader, taskRows), '');

  const gated = rows.filter((r) => r.gate);
  if (gated.length) {
    out.push('## Engine verdicts (cela 2.x)', '');
    const verdicts = group(gated, (r) => `${r.condition}: ${r.gate}`);
    out.push(table(['condition: gate verdict', 'runs', 'hidden pass', 'false COMPLETE'], [...verdicts].sort().map(([k, v]) => [
      k, v.length, `${v.filter((r) => r.hiddenPass).length}/${v.length}`, v.filter((r) => r.gate === 'COMPLETE' && !r.hiddenPass).length,
    ])), '');
    const engineRuns = rows.filter((r) => r.condition !== 'none' && !r.error);
    out.push(`Engine used in ${engineRuns.filter((r) => r.engineCalls > 0).length}/${engineRuns.length} cela runs; gate reached in ${gated.length}.`, '');
  }

  const cela = rows.filter((r) => r.condition !== 'none' && !r.error);
  if (cela.length) {
    out.push('## cela terminal states and state footprint', '');
    const terminals = group(cela, (r) => `${r.condition}: ${(r.terminal || []).join('+') || 'none reported'}`);
    out.push(table(['condition: terminal', 'runs'], [...terminals].sort().map(([k, v]) => [k, v.length])), '');
    out.push(table(['condition', 'SKILL.md read', 'mean state files', 'mean state bytes'], conditions.filter((c) => c !== 'none').map((c) => {
      const subset = cela.filter((r) => r.condition === c);
      return [c, `${subset.filter((r) => r.skillRead).length}/${subset.length}`, fmt(mean(subset.map((r) => r.state && r.state.files)), 1), fmt(mean(subset.map((r) => r.state && r.state.bytes)))];
    })), '');
  }

  const errors = rows.filter((r) => r.error);
  if (errors.length) {
    out.push('## Errors', '', ...errors.map((r) => `- ${r.task} / ${r.condition} / ${r.agent}: ${r.error}`), '');
  }
  return out.join('\n');
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    process.stderr.write('usage: node eval/report.js <results-dir> [--write]\n');
    process.exitCode = 1;
    return;
  }
  const text = report(path.resolve(dir));
  process.stdout.write(`${text}\n`);
  if (process.argv.includes('--write')) fs.writeFileSync(path.join(dir, 'report.md'), `${text}\n`);
}

if (require.main === module) main();

module.exports = { load, report };
