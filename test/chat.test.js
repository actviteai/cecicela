'use strict';

/**
 * The chat tier: ceciCela for Projects.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const HOSTS = ['claude', 'chatgpt', 'grok'];
const T = require(path.join(REPO, 'packages', 'core', 'lib', 'tui.js'));
const chat = require(path.join(REPO, 'scripts', 'targets', 'chat.js'));

// What each protocol must say about itself in its first reply.
const LIMITS = {
  trouble: /can't read your files or run commands here.*cap confidence at 6.*incident stays open/s,
  ceci: /I write the job graph and the gates; I don't run jobs\. I hand state back as files/,
  cela: /no tool runs here and there is no gate/,
};

test('every host instruction file is within its limit, and the build refuses one that is not', () => {
  for (const host of [...HOSTS, 'm365', 'm365-builder']) {
    const file = { m365: 'chat/m365/appPackage/instruction.txt', 'm365-builder': 'chat/m365-builder/INSTRUCTIONS.txt' }[host] || `chat/${host}/INSTRUCTIONS.md`;
    assert.ok(read(file).length <= chat.LIMITS[host], `${file} is ${read(file).length} characters`);
  }
  const saved = chat.LIMITS.grok;
  chat.LIMITS.grok = 100;
  try {
    assert.throws(() => chat.instructions('grok'), /chat\/grok: instructions are \d+ characters; the limit is 100/);
  } finally {
    chat.LIMITS.grok = saved;
  }
});

test('the router makes every protocol state its limits in its first reply', () => {
  for (const host of [...HOSTS, 'm365', 'm365-builder']) {
    const text = read({ m365: 'chat/m365/appPackage/instruction.txt', 'm365-builder': 'chat/m365-builder/INSTRUCTIONS.txt' }[host] || `chat/${host}/INSTRUCTIONS.md`);
    assert.match(text, /The first reply of every run states/);
    for (const [skill, limit] of Object.entries(LIMITS)) assert.match(text, limit, `${host}: ${skill}`);
    assert.match(text, /npx --yes @actvite\/cecicela install --all/, `${host}: every pack ends with the install line`);
    assert.match(text, /Never emit the player twice|no live HTML surface/, host);
  }
});

test('fixture conversations: the worked first reply of each protocol states its limits', () => {
  // The expected first replies are the worked examples the pack ships; a host
  // whose first reply drifts from them is the regression.
  const firstReply = (md) => md.split('**Assistant')[1];
  assert.match(firstReply(read('chat/pack/knowledge/examples/trouble.md')), LIMITS.trouble);
  assert.match(firstReply(read('chat/pack/knowledge/examples/ceci.md')), LIMITS.ceci);
  assert.match(firstReply(read('chat/pack/knowledge/examples/cela.md')), LIMITS.cela);
  assert.match(firstReply(read('chat/pack/knowledge/examples/trouble.md')), /^[\s\S]*?Using the four-minds debug protocol/);
  assert.match(firstReply(read('chat/pack/knowledge/examples/trouble.md')), /INCIDENT_RESOLVED=no/);
  assert.doesNotMatch(read('chat/pack/knowledge/examples/cela.md'), /^REVIEW: (COMPLETE|STALLED|BLOCKED|MISSING_TEST)/m);
});

test('the knowledge files carry the CLI protocols, not copies maintained by hand', () => {
  const strip = (md) => md.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
  assert.ok(read('chat/pack/knowledge/trouble.chat.md').includes(strip(read('packages/trouble/skill/SKILL.md'))));
  assert.match(read('chat/pack/knowledge/trouble.chat.md'), /^# trouble in chat: untooled mode/);
  const ceci = read('chat/pack/knowledge/ceci.chat.md');
  assert.match(ceci, /cela_gate: null \| COMPLETE \| STALLED \| BLOCKED \| MISSING_TEST/);
  assert.doesNotMatch(ceci, /^### CLI$/m, 'the CLI section is dropped in chat');
  assert.match(read('chat/pack/knowledge/cela.chat.md'), /\| runtime \| 30 \|/, 'the oracle table comes from the cela skill');
  assert.equal(read('chat/pack/knowledge/voices.default.yaml'), read('packages/trouble/skill/voices.default.yaml'));
  for (const host of HOSTS) {
    for (const rel of ['knowledge/ceci.chat.md', 'knowledge/cela.chat.md', 'knowledge/trouble.chat.md', 'knowledge/graph-render.md', 'graph-player.html']) {
      assert.equal(read(`chat/${host}/${rel}`), read(`chat/pack/${rel}`), `${host}/${rel}`);
    }
    assert.ok(fs.existsSync(path.join(REPO, 'chat', host, 'SETUP.md')));
  }
});

test('graph frames, in text, is three blocks of the same 80x24 screen revealed by column', () => {
  const md = read('chat/pack/knowledge/examples/graph-frames.md');
  const blocks = [...md.matchAll(/```text\n([\s\S]*?)\n```/g)].map((m) => m[1].split('\n'));
  assert.equal(blocks.length, 3);
  for (const block of blocks) assert.equal(block.length, 24);
  const widths = blocks.map((b) => Math.max(...b.map((l) => l.length)));
  assert.ok(widths[0] <= 27 && widths[1] <= 54 && widths[2] <= 80, widths.join(','));
  assert.equal(blocks[2].join('\n'), T.render(T.fromStateMd(read('chat/src/state.example.md')), { tick: 0 }).lines.map((l) => l.trimEnd()).join('\n'));
});

test('a 10-turn ceci run costs one player emission plus ten one-line edits', () => {
  const player = read('chat/pack/graph-player.html');
  const marker = '  // append new event lines above this one\n';
  const transcript = [player];
  let doc = player;
  const lines = Array.from({ length: 10 }, (_, i) => `t${12 + i} j6 ${i % 2 ? 'gate gate:human' : 'blocked'}`);
  for (const line of lines) {
    const edit = `  ${JSON.stringify(line)},\n`;
    assert.equal(edit.split('\n').length, 2, 'each edit is one line');
    doc = doc.replace(marker, `${edit}${marker}`);
    transcript.push(edit);
  }
  assert.equal(transcript.join('').split('<!doctype html>').length - 1, 1, 'the transcript holds one copy of the player');
  const scripts = [...doc.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const el = { innerHTML: '' };
  const ctx = { document: { getElementById: () => el, querySelectorAll: () => [], addEventListener() {}, documentElement: { setAttribute() {} } }, setTimeout: () => 0, JSON, Math, Object, Array };
  ctx.window = ctx;
  ctx.self = ctx;
  vm.createContext(ctx);
  for (const code of scripts) vm.runInContext(code, ctx);
  assert.equal(vm.runInContext('EVENTS.length', ctx), 11 + 10);
  ctx.typed = null;
  assert.match(vm.runInContext('screen()', ctx).lines.join('\n'), /turn 21 {2}j6 gate gate:human/);
});

test('graph off in a turn stops the drawing and survives a state.md re-upload', () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-graph-off-'));
  const ceci = path.join(REPO, 'packages', 'ceci', 'skill', 'tool', 'ceci.js');
  spawnSync(process.execPath, [ceci, 'init', '--work-dir', work]);
  const state = read('chat/src/state.example.md').replace('title: "ship the docs site"\n', 'title: "ship the docs site"\ngraph: off\n');
  // Done jobs need their artifacts for the strict parser's status check.
  for (const a of ['repo/', 'site/']) fs.mkdirSync(path.join(work, a), { recursive: true });
  for (const a of ['content-model.md', 'theme.md']) fs.writeFileSync(path.join(work, a), 'x');
  fs.writeFileSync(path.join(work, 'state.md'), state);
  const event = spawnSync(process.execPath, [ceci, 'event', '--work-dir', work, '--line', 'j6 ready'], { encoding: 'utf8' });
  assert.equal(event.status, 0, event.stderr);
  const after = fs.readFileSync(path.join(work, 'state.md'), 'utf8');
  assert.match(after, /^title: "ship the docs site"\ngraph: off\njobs:/, 'the CLI keeps the setting');
  const screen = spawnSync(process.execPath, [ceci, 'status', '--work-dir', work, '--screen'], { encoding: 'utf8' });
  assert.match(screen.stdout, /graph off -- type "graph on" to draw/);
  assert.match(T.render(T.fromStateMd(after)).lines.join('\n'), /graph off/, 'and so does the player');
});

test('the Microsoft 365 package is a valid v1.9 declarative agent', () => {
  const agent = JSON.parse(read('chat/m365/appPackage/declarativeAgent.json'));
  assert.equal(agent.version, 'v1.9');
  assert.ok(agent.name.length <= 100 && agent.description.length <= 1000);
  assert.equal(agent.instructions, "$[file('instruction.txt')]");
  assert.ok(agent.conversation_starters.length <= 12);
  assert.ok(agent.agent_skills.length <= 8);
  for (const { folder } of agent.agent_skills) {
    assert.doesNotMatch(folder, /\.\./);
    const skill = read(path.join('chat/m365/appPackage', folder, 'SKILL.md'));
    assert.match(skill, new RegExp(`^---\\nname: ${path.basename(folder)}\\ndescription: "`));
  }
  assert.deepEqual(agent.capabilities, [{ name: 'CodeInterpreter' }]);
  assert.ok(agent.disclaimer.text.length <= 500);
  const manifest = JSON.parse(read('chat/m365/appPackage/manifest.json'));
  assert.deepEqual(manifest.copilotAgents.declarativeAgents, [{ id: 'declarativeAgent', file: 'declarativeAgent.json' }]);
  assert.equal(manifest.version, JSON.parse(read('packages/cecicela/package.json')).version);
  const png = (rel) => {
    const b = fs.readFileSync(path.join(REPO, 'chat/m365/appPackage', rel));
    assert.equal(b.toString('latin1', 1, 4), 'PNG');
    return [b.readUInt32BE(16), b.readUInt32BE(20)];
  };
  assert.deepEqual(png(manifest.icons.color), [192, 192]);
  assert.deepEqual(png(manifest.icons.outline), [32, 32]);
});

test('chat knowledge names no tool step the chat cannot take', () => {
  const cela = fs.readFileSync(path.join(REPO, 'chat/pack/knowledge/cela.chat.md'), 'utf8');
  assert.doesNotMatch(cela, /\bT (check|gate|protocol)\b|gate's verdict/);
  const ceci = fs.readFileSync(path.join(REPO, 'chat/pack/knowledge/ceci.chat.md'), 'utf8');
  assert.match(ceci, /Rule 1: a first chat has no `brief\.md` or `state\.md`/);
  assert.doesNotMatch(ceci, /^## Playbooks$/m);
  for (const host of ['chatgpt', 'claude', 'grok']) {
    assert.match(fs.readFileSync(path.join(REPO, 'chat', host, 'SETUP.md'), 'utf8').trimEnd(), /npx --yes @actvite\/cecicela install --all`$/, host);
  }
});

test('the Microsoft 365 skills name only what the package carries', () => {
  const dir = path.join(REPO, 'chat/m365/appPackage/skills');
  for (const name of fs.readdirSync(dir)) {
    const md = fs.readFileSync(path.join(dir, name, 'SKILL.md'), 'utf8');
    assert.doesNotMatch(md, /`graph-render\.md`|Project knowledge/, name);
    assert.ok(md.length < 20000, `${name} is ${md.length} characters`);
  }
  assert.ok(fs.existsSync(path.join(dir, 'trouble', 'voices.default.yaml')));
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'chat/m365/appPackage/manifest.json'), 'utf8'));
  assert.equal(manifest.developer.termsOfUseUrl, 'https://www.actvite.com/tos');
});

test('the Agent Builder kit is text files only, at most 20, naming nothing the agent does not have', () => {
  const dir = path.join(REPO, 'chat/m365-builder/knowledge');
  const files = fs.readdirSync(dir).sort();
  assert.ok(files.length <= 20 && files.length >= 10, `${files.length} files`);
  for (const name of files) {
    assert.match(name, /\.txt$/, name);
    const body = fs.readFileSync(path.join(dir, name), 'utf8');
    assert.doesNotMatch(body, /`(graph-render\.md|voices\.default\.yaml|[a-z]+\.chat\.md)`|Project knowledge|Project's knowledge/, name);
  }
  assert.deepEqual(files.filter((f) => /\.chat\.txt$/.test(f)), ['ceci.chat.txt', 'cela.chat.txt', 'trouble.chat.txt']);
  const instr = read('chat/m365-builder/INSTRUCTIONS.txt');
  assert.match(instr, /`trouble\.chat\.txt`/);
  assert.doesNotMatch(instr, /Project|agent skill/);
  assert.match(read('chat/m365-builder/LISTING.md'), /seal-192\.png/);
});
