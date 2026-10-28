'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const core = require('../lib');

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));

test('the harness table covers nine harnesses and honors every home override', () => {
  assert.deepEqual(core.harness.IDS, ['claude', 'grok', 'codex', 'cline', 'goose', 'cursor', 'copilot', 'antigravity', 'hermes']);
  const h = core.harness.homes({ HOME: '/h' }, 'linux');
  assert.deepEqual(core.harness.skillDests('claude', h, 'x'), [path.join('/h', '.claude', 'skills', 'x')]);
  assert.deepEqual(core.harness.skillDests('codex', h, 'x'), core.harness.skillDests('goose', h, 'x'), 'Codex and Goose share ~/.agents/skills');
  assert.deepEqual(core.harness.skillDests('antigravity', h, 'x'), [path.join('/h', '.gemini', 'antigravity-cli', 'skills', 'x'), path.join('/h', '.gemini', 'config', 'skills', 'x')]);
  assert.deepEqual(core.harness.skillDests('hermes', h, 'x'), [path.join('/h', '.hermes', 'skills', 'software-development', 'x')]);
  const moved = core.harness.homes({ HOME: '/h', CLAUDE_HOME: '/c', AGENTS_HOME: '/a', HERMES_HOME: '/he', COPILOT_HOME: '/co' }, 'linux');
  assert.equal(moved.claude, '/c');
  assert.equal(moved.agents, '/a');
  assert.equal(moved.hermes, '/he');
  assert.equal(moved.copilot, '/co');
  assert.equal(core.harness.homes({ USERPROFILE: '/u' }, 'win32').hermes, path.join('/u', 'AppData', 'Local', 'hermes'));
  const sel = core.harness.parseSelectors(['--claude', '--claude', '--grok', '--force']);
  assert.deepEqual(sel.harnesses, ['claude', 'grok']);
  assert.deepEqual(sel.rest, ['--force']);
  assert.deepEqual(core.harness.parseSelectors(['--all']).harnesses, core.harness.IDS);
  assert.throws(() => core.harness.byId('nope'), /unknown harness/);
});

test('publishTree swaps in a verified copy and leaves the old tree when staging fails', () => {
  const root = tmp('core-tree-');
  const dest = path.join(root, 'skills', 's');
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(path.join(dest, 'SKILL.md'), 'OLD');
  const bad = path.join(root, 'bad');
  fs.mkdirSync(bad);
  fs.writeFileSync(path.join(bad, 'README.md'), 'no skill');
  assert.throws(() => core.fsx.publishTree(bad, dest), /SKILL\.md/);
  assert.equal(fs.readFileSync(path.join(dest, 'SKILL.md'), 'utf8'), 'OLD');
  core.fsx.publishTree(new Map([['SKILL.md', { text: 'NEW', exec: false }], ['tool/x.js', { text: '1', exec: true }]]), dest);
  assert.equal(fs.readFileSync(path.join(dest, 'SKILL.md'), 'utf8'), 'NEW');
  assert.deepEqual(fs.readdirSync(path.join(root, 'skills')), ['s'], 'no staging or backup directory left behind');
  if (process.platform !== 'win32') assert.notEqual(fs.statSync(path.join(dest, 'tool', 'x.js')).mode & 0o111, 0);
});

test('placeConfigFile keeps an edited file unless forced, with a tagged sidecar and backup', () => {
  const root = tmp('core-cfg-');
  const dest = path.join(root, 'AGENTS.md');
  fs.writeFileSync(dest, 'mine\n');
  assert.equal(core.fsx.placeConfigFile(null, dest, { content: 'ours\n', tag: 'x' }).action, 'kept');
  assert.equal(fs.readFileSync(`${dest}.x`, 'utf8'), 'ours\n');
  assert.equal(core.fsx.placeConfigFile(null, dest, { content: 'ours\n', tag: 'x', force: true }).action, 'replaced');
  assert.equal(fs.readFileSync(`${dest}.x-backup`, 'utf8'), 'mine\n');
  assert.equal(core.fsx.placeConfigFile(null, dest, { content: 'ours\n', tag: 'x' }).action, 'unchanged');
});

test('installSkill writes shared directories once and status finds them', () => {
  const homes = core.harness.homes({ HOME: tmp('core-inst-') }, 'linux');
  const src = new Map([['SKILL.md', { text: '---\nname: s\n---\n', exec: false }]]);
  const written = core.install.installSkill({ name: 's', source: src, harnesses: ['codex', 'goose', 'claude'], homes });
  assert.deepEqual(written.map((w) => [w.id, w.shared]), [['codex', false], ['goose', true], ['claude', false]]);
  const rows = core.install.status('s', homes);
  assert.deepEqual(rows.filter((r) => r.installed).map((r) => r.id), ['claude', 'codex', 'goose']);
  assert.match(core.install.formatStatus('s', rows), /\[x\] Anthropic Claude Code/);
  assert.throws(() => core.install.installSkill({ name: 'Bad Name', source: src, harnesses: [], homes }), /bad skill name/);
});

test('versions: check finds drift, stamp repairs it, keep-version lines are left alone', () => {
  const root = tmp('core-ver-');
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"x","version":"2.0.0"}\n');
  fs.writeFileSync(path.join(root, 'plugin.json'), '{\n  "version": "1.0.0"\n}\n');
  fs.writeFileSync(path.join(root, 'SKILL.md'), '# x 1.0.0\nhistory 0.9.0 <!-- keep-version -->\n');
  fs.writeFileSync(path.join(root, 'bin.js'), 'const v = require("./package.json").version;\n');
  const targets = { json: [['plugin.json', ['version']]], prose: ['SKILL.md'], none: ['bin.js'] };
  assert.equal(core.versions.check(root, targets).length, 3);
  assert.deepEqual(core.versions.stamp(root, targets).changed, ['plugin.json', 'SKILL.md']);
  assert.deepEqual(core.versions.check(root, targets), []);
  assert.match(fs.readFileSync(path.join(root, 'SKILL.md'), 'utf8'), /^# x 2\.0\.0\nhistory 0\.9\.0 <!-- keep-version -->/);
  fs.writeFileSync(path.join(root, 'bin.js'), 'const v = "2.0.0";\n');
  assert.match(core.versions.check(root, targets)[0], /hardcoded version/);
});

test('gen: drift reports stale, missing, stray, and binary differences; write repairs them', () => {
  const root = tmp('core-gen-');
  const targets = [{
    out: 'out',
    why: 'test',
    modes: false,
    files: new Map([['a.txt', { text: 'a\n', exec: false }], ['b.png', { buffer: Buffer.from([0, 255, 1]), exec: false }]]),
  }];
  assert.deepEqual(core.gen.drift(root, targets).sort(), ['out/a.txt is missing', 'out/b.png is missing']);
  core.gen.write(root, targets);
  assert.deepEqual(core.gen.drift(root, targets), []);
  fs.writeFileSync(path.join(root, 'out', 'b.png'), Buffer.from([0, 254, 1]));
  fs.writeFileSync(path.join(root, 'out', 'stray.md'), 'x');
  fs.writeFileSync(path.join(root, 'out', 'a.txt'), 'a\r\n');
  assert.deepEqual(core.gen.drift(root, targets).sort(), ['out/b.png is stale', 'out/stray.md is not generated; remove it or run npm run sync']);
  core.gen.write(root, targets);
  assert.deepEqual(core.gen.drift(root, targets), []);
  assert.equal(fs.existsSync(path.join(root, 'out', 'stray.md')), false);
});

test('a second forced replace keeps the first backup', () => {
  const dir = tmp('core-backup-');
  const dest = path.join(dir, 'f.md');
  fs.writeFileSync(dest, 'mine\n');
  const first = core.fsx.placeConfigFile(null, dest, { content: 'ours\n', tag: 'x', force: true });
  fs.writeFileSync(dest, 'mine again\n');
  const second = core.fsx.placeConfigFile(null, dest, { content: 'ours\n', tag: 'x', force: true });
  assert.notEqual(first.backup, second.backup);
  assert.equal(fs.readFileSync(first.backup, 'utf8'), 'mine\n');
  assert.equal(fs.readFileSync(second.backup, 'utf8'), 'mine again\n');
});

test('handoff runs a co-installed bundle, else npx @actvite/cecicela@latest', () => {
  const REPO = path.resolve(__dirname, '..', '..', '..');
  const local = core.handoff.command(['install', '--claude'], { from: path.join(REPO, 'packages', 'trouble') });
  assert.equal(local[0], process.execPath);
  assert.deepEqual(local[1], [path.join(REPO, 'packages', 'cecicela', 'bin', 'cecicela.js'), 'install', '--claude']);
  const away = tmp('core-handoff-');
  assert.equal(core.handoff.localBundle(away), null);
  const [file, argv, opts] = core.handoff.command(['install', '--all'], { from: away, platform: 'linux' });
  assert.equal(file, 'npx');
  assert.deepEqual(argv, ['--yes', '@actvite/cecicela@latest', 'install', '--all']);
  assert.equal(opts.shell, false);
  assert.equal(core.handoff.command(['install'], { from: away, platform: 'win32' })[2].shell, true, 'npx.cmd needs a shell on Windows');
  assert.match(core.handoff.NOTICE('trouble'), /^trouble is part of ceciCela/);
});
