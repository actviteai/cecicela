'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const vm = require('vm');

const CLI = path.join(__dirname, '..', 'skill', 'tool', 'ceci.js');

function run(args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
}

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ceci-prep-'));
}

/** Every file under dir, relative, with its bytes: what "nothing was written or deleted" compares. */
function snapshot(dir) {
  const out = {};
  (function walk(rel) {
    for (const entry of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const child = path.join(rel, entry.name);
      if (entry.isDirectory()) walk(child);
      else out[child.split(path.sep).join('/')] = fs.readFileSync(path.join(dir, child), 'utf8');
    }
  }('.'));
  return out;
}

const PLAN = [
  'title: "50k CAD a month of new business"',
  'jobs:',
  ...[
    ['options', 'done', '[]', 'options.md'],
    ['leads', 'done', '[options]', 'out/leads.csv'],
    ['pitch', 'done', '[options]', 'pitch.md'],
    ['price', 'gate', '[pitch]', 'offer.md'],
    ['contact', 'gate', '[leads, pitch]', 'out/outreach.md'],
  ].flatMap(([id, status, deps, artifact]) => [
    `  - id: ${id}`,
    `    goal: ${id} job`,
    '    owner: self',
    `    depends_on: ${deps}`,
    '    schedule: once',
    `    status: ${status}`,
    '    done_test: the artifact exists',
    `    artifact: ${artifact}`,
    '    gpu: null',
    '    cela_gate: null',
  ]),
  'events:',
  '  - "options done"',
  '  - "leads done"',
  '  - "pitch done"',
  '  - "price gate gate:price"',
  '  - "contact gate gate:contact"',
  '',
].join('\n');

/** A work dir holding PLAN: brief, state, log, and the done jobs' artifacts. */
function plan() {
  const dir = tmp();
  assert.equal(run(['init', '--work-dir', dir]).status, 0);
  fs.writeFileSync(path.join(dir, 'state.md'), PLAN);
  fs.writeFileSync(path.join(dir, 'log.md'), '2026-10-26T20:56Z | contact | gate | waiting on a yes\n');
  fs.mkdirSync(path.join(dir, 'out'));
  fs.writeFileSync(path.join(dir, 'options.md'), 'options\n');
  fs.writeFileSync(path.join(dir, 'out', 'leads.csv'), 'a,b\n');
  fs.writeFileSync(path.join(dir, 'pitch.md'), 'pitch\n');
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'not part of the plan\n');
  return dir;
}

test('prep on an empty folder reports nothing found and writes nothing', () => {
  const dir = tmp();
  const res = run(['prep', '--work-dir', dir, '--json']);
  assert.equal(res.status, 0, res.stderr);
  const report = JSON.parse(res.stdout);
  assert.equal(report.found, false);
  assert.equal(report.brief, null);
  assert.equal(report.state, null);
  assert.equal(report.log, null);
  assert.deepEqual(report.ask, ['animate', 'approach']);
  assert.match(report.summary, /^Nothing in /);
  assert.deepEqual(fs.readdirSync(dir), []);
  const missing = path.join(dir, 'not-yet');
  assert.equal(run(['prep', '--work-dir', missing]).status, 0);
  assert.equal(fs.existsSync(missing), false, 'prep does not create the work dir');
});

test('prep on an existing plan reports the right counts and gate jobs, and changes nothing', () => {
  const dir = plan();
  const before = snapshot(dir);
  const report = JSON.parse(run(['prep', '--work-dir', dir, '--json']).stdout);
  assert.equal(report.found, true);
  assert.equal(report.state.title, '50k CAD a month of new business');
  assert.equal(report.state.jobs, 5);
  assert.deepEqual(report.state.counts, { ready: 0, running: 0, blocked: 0, done: 3, gate: 2 });
  assert.deepEqual(report.state.gates.map((g) => [g.id, g.gate]), [['price', 'price'], ['contact', 'contact']]);
  assert.equal(report.log.last, '2026-10-26T20:56Z | contact | gate | waiting on a yes');
  assert.deepEqual(report.brief.fields.never, ['contact without yes', 'set a price', 'post or pay without yes']);
  assert.equal(report.brief.prepped, null);
  assert.deepEqual(report.ask, ['plan', 'brief', 'animate', 'approach']);
  assert.match(report.summary, /: 50k CAD a month of new business — 3 of 5 jobs done, 2 waiting on you \(price, contact\), last change \d{4}-\d\d-\d\d\.$/);
  const text = run(['prep', '--work-dir', dir]);
  assert.equal(text.status, 0);
  assert.match(text.stdout, /3 of 5 jobs done/);
  assert.deepEqual(snapshot(dir), before);
});

test('archive moves every listed file, deletes nothing, and refuses an existing destination', () => {
  const dir = plan();
  const before = snapshot(dir);
  const res = run(['archive', '--work-dir', dir, '--to', 'first']);
  assert.equal(res.status, 0, res.stderr);
  const dest = path.join(dir, 'runs', 'first');
  assert.equal(res.stdout, `${dest}\n`);
  const after = snapshot(dir);
  const moved = ['brief.md', 'state.md', 'log.md', 'options.md', 'out/leads.csv', 'pitch.md'];
  for (const rel of moved) {
    assert.equal(after[`runs/first/${rel}`], before[rel], rel);
    assert.equal(rel in after, false, `${rel} left the work dir`);
  }
  assert.equal(after['notes.txt'], before['notes.txt'], 'a file the plan does not name stays');
  assert.equal(Object.keys(after).length, Object.keys(before).length, 'no file was deleted or added');
  // A new plan, then a second archive into the same name: refused, nothing moves.
  assert.equal(run(['init', '--work-dir', dir]).status, 0);
  const again = snapshot(dir);
  const refused = run(['archive', '--work-dir', dir, '--to', 'first']);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /refusing to archive into .*first.*: it exists/);
  assert.deepEqual(snapshot(dir), again);
  assert.equal(run(['archive', '--work-dir', dir, '--to', '../out']).status, 2, '--to is one folder name');
});

test('archive with no name uses the UTC time, and --keep-brief leaves the brief in place', () => {
  const dir = plan();
  const brief = fs.readFileSync(path.join(dir, 'brief.md'), 'utf8');
  const res = run(['archive', '--work-dir', dir, '--keep-brief']);
  assert.equal(res.status, 0, res.stderr);
  assert.match(path.basename(res.stdout.trim()), /^\d{4}-\d\d-\d\dT\d{6}Z$/);
  assert.equal(fs.readFileSync(path.join(dir, 'brief.md'), 'utf8'), brief);
  assert.equal(fs.readFileSync(path.join(res.stdout.trim(), 'brief.md'), 'utf8'), brief);
  assert.equal(fs.existsSync(path.join(dir, 'state.md')), false);
});

test('player output contains the inlined state and renders the same frame as status --screen', () => {
  const dir = plan();
  const out = path.join(dir, 'graph-player.html');
  const res = run(['player', '--work-dir', dir, '--out', out]);
  assert.equal(res.status, 0, res.stderr);
  const html = fs.readFileSync(out, 'utf8');
  assert.ok(html.includes(JSON.stringify(PLAN.slice(0, PLAN.indexOf('events:')))), 'state.md is inlined');
  assert.ok(html.includes('  "contact gate gate:contact",\n  // append new event lines above this one'), 'events are the EVENTS array');
  assert.doesNotMatch(html, /https?:\/\//, 'the page requests nothing');
  assert.doesNotMatch(html, /@@(TUI|STATE|EVENTS)@@/);
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const el = { innerHTML: '', addEventListener() {}, getAttribute() { return ''; } };
  const context = { document: { getElementById: () => el, querySelectorAll: () => [], addEventListener() {}, documentElement: { setAttribute() {} } }, setTimeout: () => 0, JSON, Math, Object, Array };
  context.window = context;
  context.self = context;
  vm.createContext(context);
  for (const code of scripts) vm.runInContext(code, context);
  for (const tick of [0, 1, 3]) {
    const cli = run(['status', '--work-dir', dir, '--screen', '--tick', String(tick)]);
    assert.equal(cli.status, 0, cli.stderr);
    context.typed = null;
    context.tick = tick;
    assert.equal(`${vm.runInContext('screen()', context).lines.join('\n')}\n`, cli.stdout, `tick ${tick}`);
  }
  assert.match(el.innerHTML, /50k CAD a month of new business/);
});

test('init --animate chat records animate: chat in the brief, and the start choices replace only their lines', () => {
  const dir = tmp();
  const res = run(['init', '--work-dir', dir, '--animate', 'chat', '--start', 'fresh', '--approach', 'compare']);
  assert.equal(res.status, 0, res.stderr);
  const brief = fs.readFileSync(path.join(dir, 'brief.md'), 'utf8');
  assert.match(brief, /^animate: chat$/m);
  assert.match(brief, /^start: fresh$/m);
  assert.match(brief, /^approach: compare$/m);
  assert.match(brief, /^prepped: \d{4}-\d\d-\d\dT\d\d:\d\dZ$/m);
  assert.match(brief, /^never: \["contact without yes"/m, 'the template lines stay');
  // Resuming: all three files exist, init records the new choice and touches nothing else.
  fs.writeFileSync(path.join(dir, 'state.md'), PLAN);
  const resumed = run(['init', '--work-dir', dir, '--start', 'resumed', '--animate', 'off']);
  assert.equal(resumed.status, 0, resumed.stderr);
  const after = fs.readFileSync(path.join(dir, 'brief.md'), 'utf8');
  assert.match(after, /^animate: off$/m);
  assert.match(after, /^start: resumed$/m);
  assert.equal(after.match(/^animate:/gm).length, 1);
  assert.match(after, /^approach: compare$/m);
  assert.equal(fs.readFileSync(path.join(dir, 'state.md'), 'utf8'), PLAN);
  assert.equal(run(['init', '--work-dir', dir]).status, 1, 'without a start flag it still refuses');
  assert.equal(run(['init', '--work-dir', dir, '--animate', 'loud']).status, 2);
});

test('status warns when prepped is missing', () => {
  const dir = plan();
  const res = run(['status', '--work-dir', dir]);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stderr, /^warning: brief\.md has no prepped: line; this plan skipped the Prep step/);
  assert.match(run(['status', '--work-dir', dir, '--screen']).stderr, /no prepped: line/);
  assert.equal(run(['init', '--work-dir', dir, '--start', 'resumed', '--animate', 'off']).status, 0);
  assert.equal(run(['status', '--work-dir', dir]).stderr, '');
});
