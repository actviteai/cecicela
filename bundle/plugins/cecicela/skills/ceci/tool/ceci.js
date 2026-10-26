#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const tui = require('./tui.js');

const STATUSES = new Set(['ready', 'running', 'blocked', 'done', 'gate']);
const GATES = new Set(['COMPLETE', 'STALLED', 'BLOCKED', 'MISSING_TEST']);
const SCHEDULES = new Set(['once', 'cron']);
const JOB_KEYS = ['id', 'goal', 'owner', 'depends_on', 'schedule', 'status', 'done_test', 'artifact', 'gpu', 'cela_gate'];

const BRIEF = [
  'number: ""',
  'never: ["contact without yes", "set a price", "post or pay without yes"]',
  'deadline: ""',
  'tools: []',
  '',
].join('\n');

// The start choices the Prep step records in brief.md (playbooks/start.md).
const START = { start: ['resumed', 'fresh', 'new-dir'], animate: ['chat', 'terminal', 'off'], approach: ['compare', 'given'] };
const PLAN_FILES = ['brief.md', 'state.md', 'log.md'];

const STATE = 'jobs: []\n';
const GRAPH_MODES = new Set(['on', 'off', 'frames']);
const CELA_TOKENS = { ok: 'COMPLETE', pending: null, stalled: 'STALLED', blocked: 'BLOCKED', missing_test: 'MISSING_TEST' };
// Allowed status changes (playbooks/graph.md, Status transitions). A job may restate its status.
const MOVES = {
  blocked: ['blocked', 'ready', 'gate'],
  ready: ['ready', 'running', 'blocked', 'gate'],
  running: ['running', 'done', 'gate', 'blocked'],
  gate: ['gate', 'ready', 'running', 'done', 'blocked'],
  done: ['done'],
};

const USAGE = `usage: ceci prep --work-dir PATH [--json]
       ceci init --work-dir PATH [--start resumed|fresh|new-dir] [--animate chat|terminal|off] [--approach compare|given]
       ceci status --work-dir PATH [--screen [--tick N] | --watch]
       ceci event --work-dir PATH --line TEXT
       ceci log --work-dir PATH --line TEXT
       ceci archive --work-dir PATH [--to NAME] [--keep-brief]
       ceci player --work-dir PATH --out FILE
       ceci resolve-gpu --work-dir PATH --gpu-pref PATH --model NAME [--busy HOST:DEVICE ...]
       ceci help [COMMAND]
Flags take a value as the next argument or as --name=value.

Start with:  ceci prep --work-dir ./run                 what is already there; changes nothing
Watch with:  ceci status --work-dir ./run --watch       in your own terminal; Q quits
More:        ceci help <command>
`;

// `ceci help <command>` and `ceci <command> --help`: one short page each.
const MANUAL = {
  prep: `Reads brief.md, state.md, and log.md in the work dir and reports what it found: the plan's title,
job counts by status, the jobs at a human gate, the last log line, the brief's fields, and archived
runs. It never writes. --json prints one JSON object; its "summary" is one sentence about the plan
and "ask" lists the start questions that apply (playbooks/start.md).`,
  init: `Creates any missing brief.md, state.md, or log.md and never overwrites one. With --start,
--animate, or --approach it also records those choices and a prepped: time in brief.md, replacing
only those lines, even when all three files exist. Without them it refuses when all three exist.`,
  status: `Lists ready, running, blocked, and gate jobs; exits 1 if the graph is inconsistent. Warns on
stderr when brief.md has no prepped: line (the plan skipped the Prep step).
--screen prints the 80x24 graph view once (about 2 KB; --tick N moves the spinner and packets).
--watch redraws it as state.md changes and never exits: run it in your own terminal, not in an agent.
Keys in --watch: G graph, F frames, L legend, space pause, S step, T theme, - + speed, R reset, Q quit.`,
  event: `Applies one event line to the job it names and appends it to events: in state.md:
  <job> <status> [cela:ok|pending|stalled|blocked|missing_test] [gate:<word>]
It refuses an unknown job, a forbidden transition, done without the artifact, and ready or running
with an unfinished dependency.`,
  log: 'Appends one line to log.md: YYYY-MM-DDTHH:MMZ | job_id | status | note',
  archive: `Moves brief.md, state.md, log.md, and every artifact state.md names into runs/<UTC time>/
(or runs/NAME with --to), keeping their paths. It never deletes, refuses a destination that exists,
and prints the new folder. --keep-brief copies brief.md instead of moving it, so a new plan keeps it.`,
  player: `Writes one self-contained HTML page: the graph player with tui.js and the current state.md
inlined. It loads nothing from the network. Open it in a browser, or publish it where the host can
show a page. Run it again after each job; the page replays every event in state.md.`,
  'resolve-gpu': `Picks the highest-priority free device for --model from the preference file and prints it,
then CUDA_DEVICE_ORDER=PCI_BUS_ID and CUDA_VISIBLE_DEVICES for that job. --busy skips a device.`,
};

function die(message, code) {
  process.stderr.write(`${message}\n`);
  process.exit(code === undefined ? 2 : code);
}

const FLAGS = new Set(['screen', 'watch', 'json', 'keep-brief']);

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      out._.push(arg);
      continue;
    }
    const eq = arg.indexOf('=');
    const key = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
    if (!key) die('empty flag');
    let value;
    if (eq !== -1) value = arg.slice(eq + 1);
    else if (FLAGS.has(key)) value = true;
    else {
      value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) die(`missing value for --${key}`);
      i += 1;
    }
    if (Object.prototype.hasOwnProperty.call(out, key)) out[key] = [].concat(out[key], value);
    else out[key] = value;
  }
  return out;
}

function list(value) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function workDir(args) {
  const dir = args['work-dir'];
  if (!dir || Array.isArray(dir)) die('--work-dir is required');
  return dir;
}

function quote(value) {
  if (value === null) return 'null';
  const text = String(value);
  if (text === '') return '""';
  if (/^(null|true|false|once|cron|ready|running|blocked|done|gate|COMPLETE|STALLED|BLOCKED|MISSING_TEST)$/.test(text)) {
    return JSON.stringify(text);
  }
  if (/[:#{}[\],&*!|>%@`"'\n]/.test(text) || /^\s|\s$/.test(text)) return JSON.stringify(text);
  return text;
}

function parseScalar(raw) {
  if (raw === 'null') return null;
  if (raw.startsWith('"')) {
    try {
      return JSON.parse(raw);
    } catch (err) {
      throw new Error(`bad string ${raw}`);
    }
  }
  if (raw.startsWith('[')) return parseFlow(raw);
  if (raw === '') throw new Error('empty scalar');
  return raw;
}

function parseFlow(raw) {
  if (!raw.endsWith(']')) throw new Error(`bad list ${raw}`);
  const inner = raw.slice(1, -1).trim();
  if (inner === '') return [];
  // Split on commas outside double quotes, so a quoted item may hold a comma.
  const parts = [];
  let start = 0;
  let quoted = false;
  for (let i = 0; i < inner.length; i += 1) {
    if (quoted && inner[i] === '\\') i += 1;
    else if (inner[i] === '"') quoted = !quoted;
    else if (!quoted && inner[i] === ',') {
      parts.push(inner.slice(start, i));
      start = i + 1;
    }
  }
  if (quoted) throw new Error(`bad list ${raw}`);
  parts.push(inner.slice(start));
  return parts.map((part) => parseScalar(part.trim()));
}

/**
 * state.md: optional `title:` and `graph:` header lines, the `jobs:` graph,
 * and an optional `events:` list of double-quoted event lines.
 */
function parseDoc(text) {
  const lines = String(text).replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
  const doc = { title: null, graph: null, jobs: [], events: null };
  let i = 0;
  for (const key of ['title', 'graph']) {
    const head = new RegExp(`^${key}: (.*)$`).exec(lines[i] || '');
    if (!head) continue;
    let value;
    try {
      value = parseScalar(head[1]);
    } catch (err) {
      throw new Error(`state.md line ${i + 1}: ${err.message}`);
    }
    if (typeof value !== 'string') throw new Error(`state.md line ${i + 1}: ${key} must be a string`);
    if (key === 'graph' && !GRAPH_MODES.has(value)) throw new Error(`state.md line ${i + 1}: graph must be on, off, or frames`);
    doc[key] = value;
    i += 1;
  }
  if (lines[i] === 'jobs: []') {
    i += 1;
  } else if (lines[i] === 'jobs:') {
    let current = null;
    for (i += 1; i < lines.length; i += 1) {
      const line = lines[i];
      if (line.trim() === '') continue;
      if (/^events:/.test(line)) break;
      const start = /^ {2}- id: (.*)$/.exec(line);
      if (start) {
        if (current) doc.jobs.push(current);
        current = { id: parseScalar(start[1]) };
        continue;
      }
      const field = /^ {4}([a-z_]+):(?: (.*))?$/.exec(line);
      if (!field || !current) throw new Error(`bad state.md line ${i + 1}`);
      try {
        current[field[1]] = parseScalar(field[2] === undefined ? '' : field[2]);
      } catch (err) {
        throw new Error(`state.md line ${i + 1}: ${err.message}`);
      }
    }
    if (current) doc.jobs.push(current);
  } else {
    throw new Error(`state.md line ${i + 1}: expected jobs:`);
  }
  while (i < lines.length && lines[i].trim() === '') i += 1;
  if (i < lines.length) {
    if (lines[i] === 'events: []') {
      doc.events = [];
      i += 1;
    } else if (lines[i] === 'events:') {
      doc.events = [];
      for (i += 1; i < lines.length; i += 1) {
        if (lines[i].trim() === '') continue;
        const item = /^ {2}- (".*")$/.exec(lines[i]);
        if (!item) break;
        let value;
        try {
          value = JSON.parse(item[1]);
        } catch {
          throw new Error(`state.md line ${i + 1}: bad event`);
        }
        if (typeof value !== 'string' || !value || /[\r\n]/.test(value)) throw new Error(`state.md line ${i + 1}: an event is one non-empty line`);
        doc.events.push(value);
      }
    }
    while (i < lines.length && lines[i].trim() === '') i += 1;
    if (i < lines.length) throw new Error(`bad state.md line ${i + 1}`);
  }
  doc.jobs.forEach(checkJob);
  checkGraph(doc.jobs);
  return doc;
}

function parseState(text) {
  return parseDoc(text).jobs;
}

function checkJob(job) {
  JOB_KEYS.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(job, key)) throw new Error(`job ${job.id || '?'} missing ${key}`);
  });
  Object.keys(job).forEach((key) => {
    if (!JOB_KEYS.includes(key)) throw new Error(`job ${job.id} has unknown key ${key}`);
  });
  if (typeof job.id !== 'string' || !job.id) throw new Error('job id must be a string');
  ['goal', 'owner', 'done_test', 'artifact'].forEach((key) => {
    if (typeof job[key] !== 'string') throw new Error(`job ${job.id} ${key} must be a string`);
  });
  if (!Array.isArray(job.depends_on) || job.depends_on.some((item) => typeof item !== 'string')) {
    throw new Error(`job ${job.id} depends_on must be a list of strings`);
  }
  if (!SCHEDULES.has(job.schedule)) throw new Error(`job ${job.id} has bad schedule`);
  if (!STATUSES.has(job.status)) throw new Error(`job ${job.id} has bad status`);
  if (job.gpu !== null && typeof job.gpu !== 'string') throw new Error(`job ${job.id} gpu must be null or a string`);
  if (job.cela_gate !== null && !GATES.has(job.cela_gate)) throw new Error(`job ${job.id} has bad cela_gate`);
  if (path.posix.isAbsolute(job.artifact) || path.win32.isAbsolute(job.artifact) || job.artifact.split(/[\\/]/).includes('..')) {
    throw new Error(`job ${job.id} artifact must stay inside the work dir`);
  }
  if (job.artifact.split(/[\\/]/).every((part) => part === '' || part === '.')) {
    throw new Error(`job ${job.id} artifact must name a file or directory, not the work dir`);
  }
}

function checkGraph(jobs) {
  const ids = new Set();
  jobs.forEach((job) => {
    if (ids.has(job.id)) throw new Error(`duplicate job ${job.id}`);
    ids.add(job.id);
  });
  jobs.forEach((job) => {
    job.depends_on.forEach((dep) => {
      if (dep === job.id) throw new Error(`job ${job.id} depends on itself`);
      if (!ids.has(dep)) throw new Error(`job ${job.id} depends on unknown ${dep}`);
    });
  });
  const color = new Map();
  function visit(id) {
    const seen = color.get(id) || 0;
    if (seen === 1) throw new Error('state.md has a cycle');
    if (seen === 2) return;
    color.set(id, 1);
    const job = jobs.find((item) => item.id === id);
    job.depends_on.forEach(visit);
    color.set(id, 2);
  }
  jobs.forEach((job) => visit(job.id));
}

function formatState(jobs, meta = {}) {
  const lines = [];
  if (meta.title !== null && meta.title !== undefined) lines.push(`title: ${JSON.stringify(meta.title)}`);
  if (meta.graph !== null && meta.graph !== undefined) lines.push(`graph: ${meta.graph}`);
  if (!jobs.length) lines.push('jobs: []');
  else {
    lines.push('jobs:');
    jobs.forEach((job) => {
      lines.push(`  - id: ${quote(job.id)}`);
      JOB_KEYS.slice(1).forEach((key) => {
        const value = key === 'depends_on'
          ? `[${job.depends_on.map((item) => quote(item)).join(', ')}]`
          : quote(job[key]);
        lines.push(`    ${key}: ${value}`);
      });
    });
  }
  if (meta.events) {
    if (!meta.events.length) lines.push('events: []');
    else {
      lines.push('events:');
      meta.events.forEach((line) => lines.push(`  - ${JSON.stringify(line)}`));
    }
  }
  return `${lines.join('\n')}\n`;
}

function readDoc(dir) {
  const file = path.join(dir, 'state.md');
  if (!fs.existsSync(file)) die(`missing ${file}`, 1);
  try {
    return parseDoc(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    die(err.message, 1);
  }
}

function readState(dir) {
  return readDoc(dir).jobs;
}

function parsePrefs(text) {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  const entries = [];
  let host = null;
  let sawHosts = false;
  lines.forEach((line, index) => {
    if (line.trim() === '' || line.trim().startsWith('#')) return;
    if (!sawHosts) {
      if (line !== 'hosts:') throw new Error('gpu prefs must start with hosts:');
      sawHosts = true;
      return;
    }
    const hostLine = /^ {2}([A-Za-z0-9._-]+):\s*$/.exec(line);
    if (hostLine) {
      host = hostLine[1];
      return;
    }
    const busLine = /^ {4}"([^"]+)": \{ priority: (-?\d+), models: (\[.*\]) \}$/.exec(line);
    if (!busLine || !host) throw new Error(`bad gpu prefs line ${index + 1}`);
    const models = parseFlow(busLine[3]);
    if (models.some((model) => typeof model !== 'string')) throw new Error(`bad models on line ${index + 1}`);
    entries.push({ host, bus: busLine[1], priority: Number(busLine[2]), models });
  });
  if (!sawHosts) throw new Error('gpu prefs must start with hosts:');
  return entries;
}

function chooseGpu(entries, model, busy) {
  const skipped = new Set(busy);
  const matches = entries.filter((entry) => entry.models.includes(model) && !skipped.has(`${entry.host}:${entry.bus}`));
  matches.sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    const rank = (entry) => (entry.bus === '*' ? 1 : 0);
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (a.host !== b.host) return a.host < b.host ? -1 : 1;
    if (a.bus !== b.bus) return a.bus < b.bus ? -1 : 1;
    return 0;
  });
  return matches[0] || null;
}

// CUDA_VISIBLE_DEVICES takes an index or a GPU/MIG UUID. It stops at the first
// entry it cannot parse, so a PCI bus id there would hide every device.
function cudaDevice(bus) {
  if (/^\d+$/.test(bus) || /^(GPU|MIG)-[A-Za-z0-9/-]+$/.test(bus)) return bus;
  return null;
}

function graphProblems(dir, jobs) {
  const problems = [];
  const byId = new Map(jobs.map((job) => [job.id, job]));
  jobs.forEach((job) => {
    if ((job.status === 'ready' || job.status === 'running') && job.depends_on.some((id) => byId.get(id).status !== 'done')) {
      problems.push(`${job.id} is ${job.status} with an unfinished dependency`);
    }
    if (job.status === 'done') {
      if (job.cela_gate !== null && job.cela_gate !== 'COMPLETE') problems.push(`${job.id} is done without COMPLETE`);
      const artifact = path.join(dir, job.artifact);
      if (!fs.existsSync(artifact)) problems.push(`${job.id} is done but ${job.artifact} is missing`);
    }
  });
  return problems;
}

/** UTC to the minute, the form log.md uses: 2026-10-26T20:56Z. */
function minute(date = new Date()) {
  return `${date.toISOString().slice(0, 16)}Z`;
}

/** brief.md's top-level `key: value` lines. Lenient: a value that is not valid YAML stays as written. */
function briefFields(text) {
  const fields = {};
  String(text).replace(/\r\n/g, '\n').split('\n').forEach((line) => {
    const m = /^([A-Za-z_][\w-]*):(?: (.*))?$/.exec(line);
    if (!m) return;
    const raw = (m[2] || '').trim();
    try {
      fields[m[1]] = raw === '' ? '' : parseScalar(raw);
    } catch {
      fields[m[1]] = raw;
    }
  });
  return fields;
}

/** Set top-level brief.md lines in place; a key it lacks is appended. Every other line stays as it was. */
function setBriefFields(text, fields) {
  const lines = String(text).replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n').filter((line, i, all) => line !== '' || i < all.length - 1);
  Object.entries(fields).forEach(([key, value]) => {
    const at = lines.findIndex((line) => line.startsWith(`${key}:`));
    const line = `${key}: ${value}`;
    if (at === -1) lines.push(line);
    else lines[at] = line;
  });
  return `${lines.join('\n')}\n`;
}

function startChoices(args) {
  const out = {};
  Object.entries(START).forEach(([key, values]) => {
    const value = args[key];
    if (value === undefined) return;
    if (Array.isArray(value) || !values.includes(value)) die(`--${key} must be ${values.join(', ')}`);
    out[key] = value;
  });
  return out;
}

function commandInit(args) {
  const dir = workDir(args);
  const choices = startChoices(args);
  const record = Object.keys(choices).length > 0;
  fs.mkdirSync(dir, { recursive: true });
  const existing = PLAN_FILES.filter((name) => fs.existsSync(path.join(dir, name)));
  if (existing.length === PLAN_FILES.length && !record) die(`refusing to overwrite ${existing.join(', ')}`, 1);
  if (!existing.includes('brief.md')) fs.writeFileSync(path.join(dir, 'brief.md'), BRIEF);
  if (!existing.includes('state.md')) fs.writeFileSync(path.join(dir, 'state.md'), STATE);
  if (!existing.includes('log.md')) fs.writeFileSync(path.join(dir, 'log.md'), '');
  if (record) {
    const file = path.join(dir, 'brief.md');
    fs.writeFileSync(file, setBriefFields(fs.readFileSync(file, 'utf8'), { ...choices, prepped: minute() }));
  }
}

/** What a work dir holds, for the Prep step. Reads only. */
function prepReport(dir) {
  const has = (name) => fs.existsSync(path.join(dir, name));
  const read = (name) => fs.readFileSync(path.join(dir, name), 'utf8');
  const report = { work_dir: path.resolve(dir), found: PLAN_FILES.some(has), brief: null, state: null, log: null, last_change: null, runs: [], ask: [], summary: '' };
  if (has('brief.md')) {
    const fields = briefFields(read('brief.md'));
    report.brief = { fields, prepped: typeof fields.prepped === 'string' && fields.prepped ? fields.prepped : null };
  }
  if (has('state.md')) {
    const state = { title: null, jobs: 0, counts: Object.fromEntries([...STATUSES].map((s) => [s, 0])), gates: [], error: null };
    try {
      const doc = parseDoc(read('state.md'));
      state.title = doc.title;
      state.jobs = doc.jobs.length;
      doc.jobs.forEach((job) => { state.counts[job.status] += 1; });
      const words = {};
      (doc.events || []).forEach((line) => {
        const [id, , ...rest] = line.split(/\s+/);
        rest.forEach((part) => {
          const m = /^gate:(\S+)$/.exec(part);
          if (m) words[id] = m[1];
        });
      });
      state.gates = doc.jobs.filter((job) => job.status === 'gate').map((job) => ({ id: job.id, goal: job.goal, gate: words[job.id] || null }));
    } catch (err) {
      state.error = err.message;
    }
    report.state = state;
  }
  if (has('log.md')) {
    const lines = read('log.md').split(/\r?\n/).filter((line) => line.trim());
    report.log = { lines: lines.length, last: lines.length ? lines[lines.length - 1] : null };
  }
  const times = PLAN_FILES.filter(has).map((name) => fs.statSync(path.join(dir, name)).mtime);
  if (times.length) report.last_change = new Date(Math.max(...times)).toISOString().slice(0, 10);
  if (has('runs') && fs.statSync(path.join(dir, 'runs')).isDirectory()) {
    report.runs = fs.readdirSync(path.join(dir, 'runs'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  }
  const plan = report.state && (report.state.jobs > 0 || report.state.error);
  if (plan) report.ask.push('plan');
  if (report.brief) report.ask.push('brief');
  report.ask.push('animate', 'approach');
  report.summary = summary(report);
  return report;
}

function summary(report) {
  const where = path.basename(report.work_dir);
  const s = report.state;
  if (!report.found) return `Nothing in ${where} yet: no brief.md, state.md, or log.md.`;
  if (!s || (!s.jobs && !s.error)) return `No plan in ${where} yet${report.brief ? ', but there is a brief' : ''}.`;
  if (s.error) return `A plan in ${where} that does not parse: ${s.error}.`;
  const parts = [`${s.counts.done} of ${s.jobs} jobs done`];
  if (s.gates.length) parts.push(`${s.gates.length} waiting on you (${s.gates.map((g) => g.gate || g.id).join(', ')})`);
  if (s.counts.running) parts.push(`${s.counts.running} running`);
  if (report.last_change) parts.push(`last change ${report.last_change}`);
  return `I found a plan in ${where}${s.title ? `: ${s.title}` : ''} — ${parts.join(', ')}.`;
}

function commandPrep(args) {
  const dir = workDir(args);
  const report = prepReport(dir);
  if (args.json !== undefined) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  const lines = [report.summary];
  if (report.brief) {
    const shown = Object.entries(report.brief.fields).map(([k, v]) => `  ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
    lines.push('brief.md:', ...shown);
  }
  if (report.log && report.log.last) lines.push(`last log line: ${report.log.last}`);
  if (report.runs.length) lines.push(`archived runs: ${report.runs.map((r) => `runs/${r}`).join(', ')}`);
  lines.push(`questions: ${report.ask.join(', ')}`);
  process.stdout.write(`${lines.join('\n')}\n`);
}

/** Moves the plan into runs/<name>/. Never deletes, never merges into an existing folder. */
function commandArchive(args) {
  const dir = workDir(args);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) die(`missing work dir ${dir}`, 1);
  const name = args.to === undefined ? `${new Date().toISOString().slice(0, 19).replace(/:/g, '')}Z` : args.to;
  if (typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) die('--to must be one folder name: letters, digits, dot, dash, underscore');
  const items = PLAN_FILES.filter((file) => fs.existsSync(path.join(dir, file)));
  if (items.includes('state.md')) {
    let doc;
    try {
      doc = parseDoc(fs.readFileSync(path.join(dir, 'state.md'), 'utf8'));
    } catch (err) {
      die(`state.md does not parse, so its artifacts are unknown: ${err.message}`, 1);
    }
    const artifacts = [...new Set(doc.jobs.map((job) => path.normalize(job.artifact).replace(/[\\/]+$/, '')))]
      .filter((rel) => rel.split(path.sep)[0] !== 'runs' && !PLAN_FILES.includes(rel) && fs.existsSync(path.join(dir, rel)))
      .sort((a, b) => a.length - b.length);
    // A directory artifact carries any artifact inside it.
    artifacts.forEach((rel) => {
      if (!items.some((kept) => rel.startsWith(`${kept}${path.sep}`))) items.push(rel);
    });
  }
  if (!items.length) die(`nothing to archive in ${dir}`, 1);
  const dest = path.join(dir, 'runs', name);
  if (fs.existsSync(dest)) die(`refusing to archive into ${dest}: it exists`, 1);
  fs.mkdirSync(path.join(dir, 'runs'), { recursive: true });
  fs.mkdirSync(dest);
  const keep = args['keep-brief'] !== undefined;
  items.forEach((rel) => {
    const to = path.join(dest, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    if (keep && rel === 'brief.md') fs.copyFileSync(path.join(dir, rel), to);
    else fs.renameSync(path.join(dir, rel), to);
  });
  process.stdout.write(`${dest}\n`);
}

/**
 * The renderer without its comments or indentation: same code, fewer bytes,
 * because a chat model emits the player once per conversation.
 */
function compact(js) {
  return js
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('//'))
    .join('\n');
}

/**
 * graph-player.html filled in: the renderer, state.md without its events, and
 * the events as the EVENTS array a chat model appends to. `offline` drops the
 * optional web font, so the page requests nothing.
 */
function fillPlayer(template, tuiSource, stateText, opts = {}) {
  const text = String(stateText).replace(/\r\n/g, '\n');
  const at = text.indexOf('\nevents:');
  const head = at === -1 ? text : text.slice(0, at + 1);
  const events = at === -1 ? [] : tui.fromStateMd(text).events;
  let html = String(template).replace(/\r\n/g, '\n');
  if (opts.offline) html = html.replace(/<!-- JetBrains Mono[^\n]*-->\n(?:<link rel="stylesheet" href="https:[^\n]*>\n)+/, '');
  return html
    .replace('/*@@TUI@@*/', () => compact(tuiSource))
    .replace('/*@@STATE@@*/', () => JSON.stringify(head))
    .replace('/*@@EVENTS@@*/\n', () => events.map((e) => `  ${JSON.stringify(e)},\n`).join(''));
}

function commandPlayer(args) {
  const dir = workDir(args);
  const out = args.out;
  if (!out || Array.isArray(out)) die('--out is required');
  readDoc(dir);
  const read = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');
  const html = fillPlayer(read('graph-player.html'), read('tui.js'), fs.readFileSync(path.join(dir, 'state.md'), 'utf8'), { offline: true });
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, html);
  process.stdout.write(`${out}\n`);
}

/** A plan started without the Prep step has no prepped: line in brief.md. */
function warnUnprepped(dir) {
  const file = path.join(dir, 'brief.md');
  const fields = fs.existsSync(file) ? briefFields(fs.readFileSync(file, 'utf8')) : null;
  if (fields && typeof fields.prepped === 'string' && fields.prepped) return;
  process.stderr.write(`warning: ${fields ? 'brief.md has no prepped: line' : 'no brief.md'}; this plan skipped the Prep step (playbooks/start.md)\n`);
}

/** The graph view model: the drawing reads the validated doc, never a second parser. */
function screenModel(doc) {
  return {
    kind: 'ceci',
    title: doc.title || '',
    graph: doc.graph || 'on',
    jobs: doc.jobs.map((job) => ({ id: job.id, label: job.goal, depends_on: job.depends_on, status: job.status, cela: job.cela_gate, gate: null })),
    events: doc.events || [],
  };
}

function screen(doc, tick) {
  return tui.render(screenModel(doc), { tick });
}

function commandWatch(dir) {
  const file = path.join(dir, 'state.md');
  const keys = { graph: null, legend: true, paused: false, theme: 'green', speed: 250, reveal: undefined };
  let tick = 0;
  let last = '';
  const draw = () => {
    let doc;
    try {
      doc = parseDoc(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      process.stdout.write(`\u001b[H\u001b[2J${err.message}\n`);
      return;
    }
    const model = screenModel(doc);
    if (keys.graph) model.graph = keys.graph;
    model.legend = keys.legend;
    if (model.graph === 'frames' && keys.reveal === undefined) keys.reveal = 0;
    const opts = { tick };
    if (keys.reveal !== undefined) {
      opts.reveal = keys.reveal;
      keys.reveal = keys.reveal >= tui.W ? undefined : keys.reveal + 4;
    }
    const text = tui.toAnsi(tui.render(model, opts), keys.theme);
    if (text !== last) process.stdout.write(`\u001b[H${text}`);
    last = text;
  };
  process.stdout.write('\u001b[?25l\u001b[2J');
  let timer = null;
  const loop = () => {
    if (!keys.paused) tick += 1;
    draw();
    timer = setTimeout(loop, keys.speed);
  };
  const stop = () => {
    clearTimeout(timer);
    process.stdout.write('\u001b[0m\u001b[?25h\n');
    process.exit(0);
  };
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (key) => {
      const k = key.toLowerCase();
      if (k === 'q' || key === '\u0003') stop();
      else if (k === 'g') keys.graph = keys.graph === 'off' ? 'on' : 'off';
      else if (k === 'f') keys.reveal = 0;
      else if (k === 'l') keys.legend = !keys.legend;
      else if (k === ' ') keys.paused = !keys.paused;
      else if (k === 's') tick += 1;
      else if (k === 't') keys.theme = keys.theme === 'green' ? 'amber' : 'green';
      else if (k === '-') keys.speed = Math.min(2000, keys.speed * 2);
      else if (k === '+' || k === '=') keys.speed = Math.max(60, Math.floor(keys.speed / 2));
      else if (k === 'r') {
        tick = 0;
        keys.graph = null;
        keys.reveal = undefined;
      }
      draw();
    });
  }
  process.on('SIGINT', stop);
  loop();
}

function commandStatus(args) {
  const dir = workDir(args);
  if (args.watch !== undefined) {
    readDoc(dir);
    commandWatch(dir);
    return;
  }
  if (args.screen !== undefined) {
    const doc = readDoc(dir);
    warnUnprepped(dir);
    const tick = args.tick === undefined ? 0 : Number(args.tick);
    if (!Number.isInteger(tick) || tick < 0) die('--tick must be a whole number');
    process.stdout.write(`${screen(doc, tick).lines.join('\n')}\n`);
    const problems = graphProblems(dir, doc.jobs);
    if (problems.length) die(problems.join('\n'), 1);
    return;
  }
  const jobs = readState(dir);
  warnUnprepped(dir);
  const problems = graphProblems(dir, jobs);
  ['ready', 'running', 'blocked', 'gate'].forEach((status) => {
    process.stdout.write(`${status}:\n`);
    jobs.filter((job) => job.status === status).forEach((job) => process.stdout.write(`- ${job.id}\n`));
  });
  if (problems.length) die(problems.join('\n'), 1);
}

function commandLog(args) {
  const dir = workDir(args);
  const file = path.join(dir, 'log.md');
  if (!fs.existsSync(file)) die(`missing ${file}`, 1);
  const line = args.line;
  if (typeof line !== 'string' || Array.isArray(line) || line.length === 0 || /[\r\n]/.test(line)) {
    die('--line must be one non-empty line');
  }
  fs.appendFileSync(file, `${line}\n`);
}

function commandEvent(args) {
  const dir = workDir(args);
  const line = args.line;
  if (typeof line !== 'string' || Array.isArray(line) || !line.trim() || /[\r\n]/.test(line)) die('--line must be one non-empty line');
  const parts = line.trim().split(/\s+/);
  const [id, status, ...rest] = parts;
  if (!STATUSES.has(status)) die(`event status must be one of ${[...STATUSES].join(', ')}`);
  const doc = readDoc(dir);
  const job = doc.jobs.find((item) => item.id === id);
  if (!job) die(`no job ${id} in state.md`, 1);
  let gate;
  for (const part of rest) {
    const kv = /^(cela|gate):(\S+)$/.exec(part);
    if (!kv) die(`unknown event field ${part}; use cela:<token> or gate:<word>`);
    if (kv[1] === 'cela') {
      if (!Object.prototype.hasOwnProperty.call(CELA_TOKENS, kv[2])) die(`cela: must be ${Object.keys(CELA_TOKENS).join(', ')}`);
      gate = CELA_TOKENS[kv[2]];
    }
  }
  if (!MOVES[job.status].includes(status)) die(`${id} cannot move from ${job.status} to ${status}`, 1);
  const next = { ...job, status };
  if (gate !== undefined) next.cela_gate = gate;
  if (status === 'done') {
    if (next.cela_gate !== null && next.cela_gate !== 'COMPLETE') die(`${id} cannot be done with cela_gate ${next.cela_gate}`, 1);
    if (!fs.existsSync(path.join(dir, job.artifact))) die(`${id} cannot be done: ${job.artifact} is missing`, 1);
  }
  if ((status === 'ready' || status === 'running') && job.depends_on.some((dep) => doc.jobs.find((item) => item.id === dep).status !== 'done')) {
    die(`${id} cannot be ${status} with an unfinished dependency`, 1);
  }
  const jobs = doc.jobs.map((item) => (item.id === id ? next : item));
  const events = (doc.events || []).concat(parts.join(' '));
  fs.writeFileSync(path.join(dir, 'state.md'), formatState(jobs, { title: doc.title, graph: doc.graph, events }));
}

function commandGpu(args) {
  const dir = workDir(args);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) die(`missing work dir ${dir}`, 1);
  const pref = args['gpu-pref'];
  const model = args.model;
  if (!pref || Array.isArray(pref)) die('--gpu-pref is required');
  if (!model || Array.isArray(model)) die('--model is required');
  let entries;
  try {
    entries = parsePrefs(fs.readFileSync(pref, 'utf8'));
  } catch (err) {
    die(err.code === 'ENOENT' ? `missing ${pref}` : err.message, 1);
  }
  const chosen = chooseGpu(entries, model, list(args.busy));
  if (!chosen) die(`no gpu for ${model}`, 1);
  const value = `${chosen.host}:${chosen.bus}`;
  process.stdout.write(`${value}\nCUDA_DEVICE_ORDER=PCI_BUS_ID\n`);
  if (chosen.bus === '*') return;
  const device = cudaDevice(chosen.bus);
  if (device) process.stdout.write(`CUDA_VISIBLE_DEVICES=${device}\n`);
  else {
    process.stderr.write(`${chosen.bus} is a PCI bus id; CUDA_VISIBLE_DEVICES takes an index or UUID. `
      + `On ${chosen.host}, find its index or uuid with: nvidia-smi --query-gpu=index,uuid,pci.bus_id --format=csv\n`);
  }
}

const HELP = new Set(['--help', '-h', '-help']);

function main(argv) {
  const [command, ...rest] = argv;
  if (command === 'help' || HELP.has(command)) {
    const topic = rest.find((arg) => !HELP.has(arg));
    process.stdout.write(topic && MANUAL[topic] ? manual(topic) : USAGE);
    return;
  }
  if (rest.some((arg) => HELP.has(arg))) {
    process.stdout.write(MANUAL[command] ? manual(command) : USAGE);
    return;
  }
  const args = parseArgs(rest);
  if (args._.length) die(`unexpected argument ${args._[0]}`);
  if (command === 'prep') commandPrep(args);
  else if (command === 'init') commandInit(args);
  else if (command === 'status') commandStatus(args);
  else if (command === 'log') commandLog(args);
  else if (command === 'event') commandEvent(args);
  else if (command === 'archive') commandArchive(args);
  else if (command === 'player') commandPlayer(args);
  else if (command === 'resolve-gpu') commandGpu(args);
  else {
    die(USAGE.trimEnd());
  }
}

/** The command's usage line, then its page. */
function manual(command) {
  const line = USAGE.split('\n').find((l) => l.includes(`ceci ${command} `) || l.endsWith(`ceci ${command}`));
  return `${line.replace(/^usage: | {7}/, 'usage: ')}\n${MANUAL[command]}\n`;
}

if (require.main === module) {
  // A reader that closes early (status | head) is not an error.
  process.stdout.on('error', (err) => {
    if (err.code === 'EPIPE') process.exit(0);
    throw err;
  });
  main(process.argv.slice(2));
}
else {
  module.exports = { briefFields, chooseGpu, compact, fillPlayer, formatState, parseDoc, parsePrefs, parseState, prepReport, screen, screenModel, setBriefFields };
}
