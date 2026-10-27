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
  assert.match(s.lines[0], /^ ceciCela \| ceci: ship the docs site +4\/6 done {2}low $/);
  assert.match(all, /\+==============\+/, 'done jobs have = borders');
  assert.match(all, /\|j5 deploy {5}\|/);
  assert.match(all, /\| \| run {2}cela\.\.\|/, 'running job with cela pending shows the spinner');
  assert.match(all, /->\|j2 content mod\|/, 'edges enter on the box line');
  assert.match(all, /[o*]/, 'packets move along live edges');
  assert.match(s.lines[21], /^\| #11 {5}j5 running cela:pending_ +\|$/);
  assert.match(s.lines[23], /^ \[G\]raph \[L\]egend \[B\]udget .* 11 ev \d+B$/, 'one key panel, then the events and their size');
  assert.match(s.lines[16], /\[#+\.+\] 4\/6 done {2}1 running/, 'real counts under the graph');
  assert.match(s.lines[17], /^ RUN {3}j5: deploy/, 'the job that is running, by its full goal');
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
  assert.match(el.innerHTML, /<span class="a-i"> ceciCela \| ceci/);
  assert.doesNotMatch(html, /<nav|<button/, 'the bottom row of the screen is the only key panel');
  assert.match(el.innerHTML, /<span class="a-h">\[B\]<\/span>/, 'the budget key is on it');
  assert.equal(vm.runInContext('EVENTS.length', context), example().events.length);
  assert.equal((html.match(/append new event lines above this one/g) || []).length, 1);
  assert.ok(Buffer.byteLength(html) < 36 * 1024, `the player is ${Buffer.byteLength(html)} bytes`);
});

test('step events and the budget: low draws what it always drew, medium and creator add only real steps', () => {
  assert.deepEqual((({ type, job, text }) => ({ type, job, text }))(T.parseEvent('t12 j5 step wrangler deploy: exit 0')), { type: 'step', job: 'j5', text: 'wrangler deploy: exit 0' });
  assert.deepEqual((({ type, job, text }) => ({ type, job, text }))(T.parseEvent('step user pasted npm test: 41 pass')), { type: 'step', job: null, text: 'user pasted npm test: 41 pass' });
  assert.equal(T.parseEvent('step done').type, 'job', 'a job named step keeps its status events');
  const text = fs.readFileSync(EXAMPLE, 'utf8');
  const steps = ['j5 step npm run build: 41 pages', 'j5 step wrangler deploy: exit 0'];
  const at = (budget) => {
    const model = T.fromStateMd(budget ? text.replace('title:', `budget: ${budget}\ntitle:`) : text);
    model.events = model.events.concat(steps);
    return T.render(model, { tick: 0 });
  };
  const plain = T.render(example(), { tick: 0 });
  const low = at('low');
  assertScreen(low);
  assert.deepEqual(low.lines.slice(1, 18), plain.lines.slice(1, 18), 'low: same graph and legend as before steps existed');
  assert.match(low.lines[0], /4\/6 done {2}low $/, 'the title names the budget, low included');
  for (const budget of ['medium', 'creator']) {
    const s = at(budget);
    assertScreen(s);
    assert.match(s.lines[0], new RegExp(`4/6 done {2}${budget} $`));
    assert.match(s.lines[17], /^ NOW {3}j5 > wrangler deploy: exit 0 +$/);
    assert.equal(s.attrs[17].slice(0, 6), 'nnnnnn', 'the NOW label is a tag');
  }
  assert.equal(T.fromStateMd('budget: lavish\njobs: []\n').budget, 'lavish', 'the lenient reader keeps it');
  assert.match(T.render(T.fromStateMd('budget: lavish\njobs: []\n')).lines[0], /0\/0 done {2}low $/, 'an unknown budget draws as low');
});

test('ceci status --screen and the player print the same creator screen, ticker and step counts included', () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'tui-creator-'));
  const state = fs.readFileSync(EXAMPLE, 'utf8').replace('title: "ship the docs site"\n', 'title: "ship the docs site"\nbudget: creator\n');
  fs.writeFileSync(path.join(work, 'state.md'), state);
  for (const a of ['repo', 'site']) fs.mkdirSync(path.join(work, a));
  for (const a of ['content-model.md', 'theme.md']) fs.writeFileSync(path.join(work, a), 'x');
  for (const line of ['j5 step npm run build: 41 pages', 'j5 step wrangler deploy: exit 0']) {
    const res = spawnSync(process.execPath, [CECI, 'event', '--work-dir', work, '--line', line], { encoding: 'utf8' });
    assert.equal(res.status, 0, res.stderr);
  }
  const out = path.join(work, 'player.html');
  assert.equal(spawnSync(process.execPath, [CECI, 'player', '--work-dir', work, '--out', out]).status, 0);
  const { context } = loadPlayer(fs.readFileSync(out, 'utf8'));
  // The CLI prints a fixed screen: no clock, no flash for a new event, ASCII glyphs.
  context.clock = null;
  context.freshAt = -100;
  context.keys.theme = 'phosphor';
  for (const tick of [0, 3]) {
    const cli = spawnSync(process.execPath, [CECI, 'status', '--work-dir', work, '--screen', '--tick', String(tick)], { encoding: 'utf8' });
    context.typed = null;
    context.tick = tick;
    const shown = vm.runInContext('screen()', context);
    assert.equal(`${shown.lines.join('\n')}\n`, cli.stdout, `tick ${tick}`);
    assert.match(cli.stdout, / NOW {3}j5 > wrangler deploy: exit 0/);
    assert.match(cli.stdout, /as of \d\d:\d\dZ$/m, 'ceci event stamps each event with its UTC minute');
  }
});
