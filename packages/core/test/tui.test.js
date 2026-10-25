'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const T = require('../lib/tui');

const REPO = path.resolve(__dirname, '..', '..', '..');
const EXAMPLE = path.join(REPO, 'chat', 'src', 'state.example.md');
const CECI = path.join(REPO, 'packages', 'ceci', 'skill', 'tool', 'ceci.js');
const PLAYER = path.join(REPO, 'chat', 'pack', 'graph-player.html');

const example = () => T.fromStateMd(fs.readFileSync(EXAMPLE, 'utf8'));

function assertScreen(screen) {
  assert.equal(screen.lines.length, 24);
  assert.equal(screen.attrs.length, 24);
  for (const line of screen.lines) {
    assert.equal(line.length, 80, JSON.stringify(line));
    assert.match(line, /^[ -~]*$/, `pure ASCII: ${line}`);
  }
}

/** Load the player exactly as a browser would, with a stub DOM, and return its context. */
function loadPlayer(html) {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.equal(scripts.length, 2, 'the player is the renderer plus one script');
  const el = { innerHTML: '', addEventListener() {}, getAttribute() { return ''; } };
  const context = {
    document: { getElementById: () => el, querySelectorAll: () => [], addEventListener() {}, documentElement: { setAttribute() {} } },
    setTimeout: () => 0,
    JSON,
    Math,
    Object,
    Array,
  };
  context.window = context;
  context.self = context;
  vm.createContext(context);
  for (const code of scripts) vm.runInContext(code, context);
  return { context, el };
}

test('every screen is 80x24 pure ASCII, for every tick and every reveal', () => {
  const model = example();
  for (const tick of [0, 1, 2, 3, 7]) assertScreen(T.render(model, { tick }));
  for (const reveal of [0, 27, 54, 80]) assertScreen(T.render(model, { tick: 0, reveal }));
  for (let step = 0; step <= model.events.length; step += 1) assertScreen(T.render(model, { tick: step, step }));
});

test('the example draws boxes by state, edges, packets, the log, and the cost line', () => {
  const s = T.render(example(), { tick: 0 });
  const all = s.lines.join('\n');
  assert.match(s.lines[0], /^ ceciCela {2}TUI \| ceci: ship the docs site +turn 11\/11 {2}graph:on $/);
  assert.match(all, /\+==============\+/, 'done jobs have = borders');
  assert.match(all, /\|j5 deploy {5}\|/);
  assert.match(all, /\| \| run {2}cela\.\.\|/, 'running job with cela pending shows the spinner');
  assert.match(all, /->\|j2 content mod\|/, 'edges enter on the box line');
  assert.match(all, /[o*]/, 'packets move along live edges');
  assert.match(s.lines[21], /^\| turn 11 {2}j5 running cela:pending_ +\|$/);
  assert.match(s.lines[23], / 11ev=\d+B$/);
  // Spinner and packets move with the tick; nothing else does.
  const next = T.render(example(), { tick: 1 }).lines;
  assert.match(next.join('\n'), /\| \/ run {2}cela\.\.\|/);
  assert.equal(next[1], s.lines[1]);
});

test('a gate job blinks, graph off draws nothing, frames reveal columns', () => {
  const model = T.fromStateMd(fs.readFileSync(EXAMPLE, 'utf8'));
  model.events = [];
  model.jobs.find((j) => j.id === 'j6').status = 'gate';
  const on = T.render(model, { tick: 0 });
  const off = T.render(model, { tick: 1 });
  assert.match(on.lines.join('\n'), /! GATE: human/);
  assert.doesNotMatch(off.lines.join('\n'), /! GATE: human/);
  assert.match(on.attrs.join(''), /k/);
  model.graph = 'off';
  const hidden = T.render(model);
  assert.match(hidden.lines.join('\n'), /graph off -- type "graph on" to draw/);
  assert.doesNotMatch(hidden.lines.join('\n'), /\|j1 /);
  const half = T.render(example(), { reveal: 40 });
  for (const line of half.lines) assert.match(line.slice(40), /^ *$/);
});

test('events parse in all three vocabularies and apply in order', () => {
  assert.deepEqual(
    (({ job, status, cela, gate }) => ({ job, status, cela, gate }))(T.parseEvent('t07 j4 done cela:ok gate:approved')),
    { job: 'j4', status: 'done', cela: 'COMPLETE', gate: 'approved' },
  );
  assert.equal(T.parseEvent('t07 j4 done').turn, 7);
  assert.equal(T.parseEvent('h H1 0.61 stale edge cache').p, 0.61);
  assert.equal(T.parseEvent('vote detective no 5').yes, false);
  assert.equal(T.parseEvent('check C2 fail no test for empty input').state, 'fail');
  assert.equal(T.parseEvent('hello there'), null);
  const trouble = T.render({
    kind: 'trouble',
    title: 'stale page after deploy',
    events: ['h H1 0.61 stale edge cache after deploy', 'h H2 0.27 two writers on session state', 'vote keeper yes 7', 'vote detective no 5', 'vote maintainer yes 8', 'vote physicist yes 7'],
  });
  assertScreen(trouble);
  assert.match(trouble.lines.join('\n'), / H1 {2}stale edge cache after deploy +\[#{8,9}\.+\] {2}0\.61/);
  assert.match(trouble.lines.join('\n'), /GATE {2}keeper YES 7 {3}detective NO 5 {3}maintainer YES 8 {3}physicist YES 7 *\n {7}-> distill/);
  const cela = T.render({ kind: 'cela', title: 'duration parser', events: ['check C1 ok requirements listed', 'check C2 fail no test for empty input'] });
  assertScreen(cela);
  assert.match(cela.lines.join('\n'), /\[x\] C1 {3}requirements listed/);
  assert.match(cela.lines.join('\n'), /no tool ran, no gate was measured/);
});

test('ceci status --screen and the chat player print the same 80x24 screen', () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'tui-parity-'));
  fs.copyFileSync(EXAMPLE, path.join(work, 'state.md'));
  for (const job of example().jobs.filter((j) => j.status === 'done')) {
    const artifact = fs.readFileSync(EXAMPLE, 'utf8').split(`- id: ${job.id}\n`)[1].match(/artifact: (\S+)/)[1];
    fs.mkdirSync(path.dirname(path.join(work, artifact)), { recursive: true });
    if (artifact.endsWith('/')) fs.mkdirSync(path.join(work, artifact), { recursive: true });
    else fs.writeFileSync(path.join(work, artifact), 'x');
  }
  for (const tick of [0, 1, 2, 5]) {
    const cli = spawnSync(process.execPath, [CECI, 'status', '--work-dir', work, '--screen', '--tick', String(tick)], { encoding: 'utf8' });
    assert.equal(cli.status, 0, cli.stderr);
    const { context } = loadPlayer(fs.readFileSync(PLAYER, 'utf8'));
    context.typed = null;
    context.tick = tick;
    const fromPlayer = vm.runInContext('screen()', context);
    assert.equal(`${fromPlayer.lines.join('\n')}\n`, cli.stdout, `tick ${tick}`);
  }
});

test('the player loads, draws into the page, and keeps its events in one editable array', () => {
  const html = fs.readFileSync(PLAYER, 'utf8');
  const { context, el } = loadPlayer(html);
  assert.match(el.innerHTML, /<span class="a-i"> ceciCela {2}TUI/);
  assert.equal(vm.runInContext('EVENTS.length', context), example().events.length);
  assert.equal((html.match(/append new event lines above this one/g) || []).length, 1);
  assert.ok(Buffer.byteLength(html) < 32 * 1024, `the player is ${Buffer.byteLength(html)} bytes`);
});
