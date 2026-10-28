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

test('the READMEs cover machine learning and XGBoost with ceciCela', () => {
  for (const rel of ['README.md', 'packages/cecicela/README.md']) {
    const text = read(rel);
    assert.match(text, /^## Machine learning advantages$/m, rel);
    assert.match(text, /^## XGBoost with ceciCela$/m, rel);
    assert.match(text, /How to use/, rel);
    assert.match(text, /device="cuda"/, rel);
  }
  assert.match(README, /^### How to use XGBoost with `\/cecicela`$/m);
  assert.match(README, /def test_auc_not_below_baseline\(\):/);
  for (const name of ['ceci', 'cela', 'trouble']) assert.match(read(`packages/${name}/README.md`), /^## (<a id="machine-learning"><\/a> )?Machine learning$/m, name);
});

test('each skill README says it is part of ceciCela and installs all of it', () => {
  for (const name of ['ceci', 'cela', 'trouble']) {
    const text = read(`packages/${name}/README.md`);
    assert.match(text, new RegExp(`${name} is part of \\*\\*\\[ceciCela\\]\\(https://github\\.com/actviteai/cecicela\\)\\*\\* \\(\`/cecicela\`\\)`), name);
    assert.match(text, new RegExp(`[Ii]nstalling ${name} installs`), name);
  }
});

test('no doc offers a skill without the rest of ceciCela', () => {
  const docs = ['README.md', 'llms.txt', ...['ceci', 'cela', 'trouble', 'cecicela'].map((n) => `packages/${n}/README.md`), ...['ceci', 'rdapq', 'trouble'].map((n) => `docs/archive/${n}.README.md`)];
  for (const rel of docs) {
    const text = read(rel);
    assert.doesNotMatch(text, /--only/, rel);
    assert.doesNotMatch(text, /\b(ceci|cela|trouble)@cecicela\b/, rel);
    assert.doesNotMatch(text, /bundle\/hermes/, rel);
    assert.doesNotMatch(text, /(installs?|install) (alone|on its own)|\/(ceci|cela|trouble) (alone|on its own)|each skill on its own/i, rel);
  }
});

test('every package carries AI agent skill and machine learning keywords', () => {
  for (const name of ['ceci', 'cela', 'trouble', 'cecicela']) {
    const { keywords, description } = JSON.parse(read(`packages/${name}/package.json`));
    for (const word of ['agent-skills', 'ai-agent-skills', 'skill-md', 'llm', 'machine-learning', 'mlops', 'xgboost']) assert.ok(keywords.includes(word), `${name}: ${word}`);
    if (name !== 'cecicela') assert.match(description, /Part of ceciCela: installing it installs \/ceci, \/cela, \/trouble, and \/cecicela together\./, name);
    const readme = read(`packages/${name}/README.md`);
    assert.match(readme, /\*\*Keywords:\*\* AI agent skills,.*machine learning, MLOps,.*XGBoost/, name);
  }
  assert.match(read('llms.txt'), /Machine learning: .*XGBoost/);
});
