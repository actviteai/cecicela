'use strict';

/**
 * The screen tells the truth about a big graph: the work in progress is on
 * screen, whatever is out of view is counted, and every key on the bottom row
 * is one the page answers to.
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const T = require('../lib/tui');

/** A state.md with a chain of n jobs: done before `running`, then running, then blocked. */
function chain(n, running, events) {
  let md = 'title: "chain"\njobs:\n';
  for (let i = 1; i <= n; i += 1) {
    const status = i < running ? 'done' : i === running ? 'running' : 'blocked';
    md += `  - id: j${i}\n    goal: step ${i}\n    owner: self\n    depends_on: [${i > 1 ? `j${i - 1}` : ''}]\n    schedule: once\n    status: ${status}\n    done_test: t\n    artifact: a${i}.md\n    gpu: null\n    cela_gate: null\n`;
  }
  if (events) md += `events:\n${events.map((e) => `  - ${JSON.stringify(e)}\n`).join('')}`;
  return T.fromStateMd(md);
}

test('a long chain wraps into bands, so twelve jobs fit and none is hidden', () => {
  const model = chain(12, 10);
  const layout = T.layout(model.jobs);
  assert.equal(layout.bands, 3);
  assert.equal(layout.hiddenBefore, 0);
  assert.equal(layout.hiddenAfter, 0);
  assert.deepEqual(Object.keys(layout.pos).sort(), model.jobs.map((j) => j.id).sort());
  const screen = T.render(model, { tick: 0, footer: 'chat' }).lines.join('\n');
  for (const id of ['j1 ', 'j10 ', 'j12 ']) assert.ok(screen.includes(`|${id}`), id);
  assert.doesNotMatch(screen, /earlier|later >>/);
});

test('when the graph does not fit, the view follows the running job and counts what it hides', () => {
  const model = chain(20, 15);
  const layout = T.layout(model.jobs);
  assert.ok(layout.pos.j15, 'the running job is on screen');
  const shown = Object.keys(layout.pos).length;
  assert.equal(layout.hiddenBefore + layout.hiddenAfter + shown, 20, 'every job is shown or counted');
  const lines = T.render(model, { tick: 0, footer: 'chat' }).lines;
  assert.match(lines[0], /14\/20 done {2}low $/, 'the title counts the whole graph, not the window');
  assert.match(lines[16], new RegExp(`14/20 done {2}1 running .*<< ${layout.hiddenBefore} earlier`));
  assert.match(lines[17], /^ RUN {3}j15: step 15/);
});

test('the bottom row says when the view was last true: as of the newest stamped event', () => {
  const model = chain(3, 2, ['@2026-10-27T05:30Z j1 done', '@2026-10-27T05:40Z j2 running']);
  const now = Date.parse('2026-10-27T05:52:00Z');
  const chat = T.render(model, { tick: 0, footer: 'chat', now }).lines[23];
  assert.match(chat, /^ type: help {2}budget <level> {2}animate {2}graph on\|off {2}legend +as of 05:40Z 12m ago$/);
  const player = T.render(model, { tick: 0, footer: 'player', now }).lines[23];
  assert.match(player, /^ \[G\]raph \[L\]egend \[B\]udget \[T\]heme \[SPC\]pause \[R\]eplay \[-\+\]speed +05:40Z 12m ago$/, 'the age fits beside the keys');
  assert.match(T.render(model, { tick: 0, footer: 'player', now: Date.parse('2026-10-29T05:52:00Z') }).lines[23], / 05:40Z 2d ago$/);
  assert.match(T.render(model, { tick: 0, footer: 'cli' }).lines[23], /\[Q\]uit +as of 05:40Z$/, 'no clock, no age claimed');
  assert.equal(player.match(/\[G\]raph/g).length, 1, 'one key panel');
  const log = T.render(model, { tick: 1 }).lines.slice(19, 22).join('\n');
  assert.match(log, /05:30Z {2}j1 done/);
  const unstamped = T.render(chain(3, 2, ['j1 done']), { tick: 0, footer: 'chat' }).lines;
  assert.match(unstamped[23], /1 ev 8B$/, 'no stamp, no time claimed');
  assert.match(unstamped[19], /#01 {5}j1 done/);
});

test('every key on the bottom row maps to a key the player handles', () => {
  const keys = T.render(chain(2, 1), { tick: 0, footer: 'player' }).lines[23].match(/\[[^\]]+\]/g);
  assert.deepEqual(keys.map(T.hotkey), ['g', 'l', 'b', 't', ' ', 'r', '+']);
  assert.equal(T.hotkey('[Q]'), 'q');
  assert.equal(T.hotkey('type'), null);
});

test('the budget panel explains all three budgets and marks the one in state.md', () => {
  const model = chain(3, 2);
  model.budget = 'medium';
  const screen = T.render(model, { tick: 0, panel: { type: 'budget', sel: 'creator', note: 'To switch, type in the chat: budget creator', action: 'copy' } }).lines.join('\n');
  assert.match(screen, /budget: how often the view is updated/);
  assert.match(screen, / {3}low {6}status changes only/);
  assert.match(screen, / {3}medium .*\[now\]/);
  assert.match(screen, / > creator {2}every real step/);
  assert.match(screen, /Every budget shows only real work/);
  assert.match(screen, /To switch, type in the chat: budget creator/);
});

test('cp437 glyphs are the same screen with box-drawing lines, ASCII text untouched', () => {
  const model = chain(6, 7); // all done: no packets, whose trail cp437 draws as a dot
  const ascii = T.render(model, { tick: 0 }).lines;
  const box = T.render(model, { tick: 0, glyphs: 'cp437' }).lines;
  assert.match(box[1], /╒═+╕/);
  assert.match(box[2], /│j1 step 1 +│───►│j2/);
  for (let y = 0; y < 24; y += 1) {
    assert.equal(box[y].length, 80);
    const letters = (s) => s.replace(/[^A-Za-z0-9]/g, '');
    assert.equal(letters(box[y]), letters(ascii[y]), `row ${y}`);
  }
});
