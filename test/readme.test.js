'use strict';

/**
 * The README shows what the code does today: its screen is the renderer's
 * output, and its numbers are the ones the chat kit and the player carry.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const REPO = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const T = require(path.join(REPO, 'packages', 'core', 'lib', 'tui.js'));
const README = read('README.md');

test('the README screen is exactly what ceci status --screen prints for the example plan', () => {
  const block = README.match(/## The graph view\n[\s\S]*?```text\n([\s\S]*?)\n```/)[1];
  const screen = T.render(T.fromStateMd(read('chat/src/state.example.md')), { tick: 0, footer: 'cli' }).lines.map((l) => l.trimEnd()).join('\n');
  assert.equal(block, screen);
  const events = T.fromStateMd(read('chat/src/state.example.md')).events;
  const bytes = events.reduce((n, e) => n + Buffer.byteLength(e) + 1, 0);
  assert.match(README, new RegExp(`The whole example run is ${events.length} events and ${bytes} bytes of model output\\.`));
});

test('the README names the budgets, keys, and player cost the code has', () => {
  for (const level of T.BUDGETS) assert.match(README, new RegExp(`\\| \`${level}\``), level);
  assert.match(README, /`B` budget/);
  assert.match(README, /`T` theme \(phosphor, amber, or ansi/);
  const kb = Math.round(fs.statSync(path.join(REPO, 'chat/pack/graph-player.html')).size / 1024);
  assert.ok(kb >= 33 && kb <= 36, `the player is ${kb} KB; update "35 KB" in the README`);
  assert.match(README, /the 35 KB player once, about 10,000 tokens/);
});

test('the README links the video, the channel, the issue tracker, and every package on npm', () => {
  assert.match(README, /\[ceciCela, explained\]\(https:\/\/youtu\.be\/i5Ge36L_MTk\)/);
  assert.match(README, /\[actVite YouTube channel\]\(https:\/\/www\.youtube\.com\/channel\/UCPlRHTUre-GPCK__77zI5IQ\)/);
  assert.match(README, /\[open an issue\]\(https:\/\/github\.com\/actviteai\/cecicela\/issues\/new\)/);
  for (const name of ['ceci', 'cela', 'trouble', 'cecicela']) assert.ok(README.includes(`https://www.npmjs.com/package/@actvite/${name})`), name);
  assert.match(README, /^## Feedback$/m);
  assert.match(README, /\(see \[Feedback\]\(#feedback\)\)/);
});
