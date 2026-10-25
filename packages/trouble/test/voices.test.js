'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const voices = require('../skill/tool/voices');

const BIN = path.join(__dirname, '..', 'bin', 'trouble.js');
const trouble = (args, opts = {}) => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', ...opts });

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'trouble-voices-'));
}

function write(dir, rel, text) {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}

const RENAMED = 'voices:\n  keeper: {who: "The Librarian"}\n  detective:\n    who: The Inspector\n  maintainer: {who: \'The Gatekeeper\'}\n  physicist: {who: "The Timekeeper, who watches the clock"}\n';

test('the packaged default passes the validator', () => {
  assert.equal(voices.load(voices.DEFAULT_FILE).ok, true);
  assert.deepEqual(Object.keys(voices.defaults()), voices.IDS);
});

test('a project file with renamed roles is the one /trouble uses', () => {
  const project = tmp();
  write(project, '.trouble/voices.yaml', RENAMED);
  const result = voices.resolve({ project, home: tmp() });
  assert.equal(result.source, path.join(project, '.trouble', 'voices.yaml'));
  assert.deepEqual(result.refused, []);
  assert.equal(result.roles.physicist.who, 'The Timekeeper, who watches the clock');
  const cli = trouble(['voices', 'resolve', '--project', project, '--home', tmp()]);
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout, /^source: .*voices\.yaml\nvoices:\n {2}keeper: \{who: "The Librarian"\}\n {2}detective: \{who: "The Inspector"\}\n {2}maintainer: \{who: "The Gatekeeper"\}\n/);
});

test('a user file applies when the project has none; the project file wins when both exist', () => {
  const project = tmp();
  const home = tmp();
  write(home, '.trouble/voices.yaml', RENAMED.replace('The Librarian', 'Home Librarian'));
  assert.equal(voices.resolve({ project, home }).roles.keeper.who, 'Home Librarian');
  write(project, '.trouble/voices.yaml', RENAMED);
  assert.equal(voices.resolve({ project, home }).roles.keeper.who, 'The Librarian');
});

test('five roles are refused with a message, and the defaults are used', () => {
  const dir = tmp();
  const file = write(dir, 'five.yaml', `${RENAMED}  fifth: {who: "The Intern"}\n`);
  const cli = trouble(['voices', 'check', file]);
  assert.equal(cli.status, 1);
  assert.match(cli.stderr, /refused: .*five\.yaml/);
  assert.match(cli.stderr, /unknown role fifth; the roles are exactly keeper, detective, maintainer, physicist/);
  assert.match(cli.stderr, /uses the default names instead/);
  write(dir, '.trouble/voices.yaml', fs.readFileSync(file, 'utf8'));
  const result = voices.resolve({ project: dir, home: tmp() });
  assert.equal(result.source, 'defaults');
  assert.equal(result.refused.length, 1);
  assert.deepEqual(result.roles, voices.defaults());
});

test('missing, renamed, or reshaped roles are refused with a reason each', () => {
  const cases = [
    ['voices:\n  keeper: {who: "a"}\n  detective: {who: "b"}\n  maintainer: {who: "c"}\n', /missing role physicist/],
    ['voices:\n  data: {who: "a"}\n  detective: {who: "b"}\n  maintainer: {who: "c"}\n  physicist: {who: "d"}\n', /unknown role data/],
    ['voices:\n  keeper: {who: "a", does: [x]}\n  detective: {who: "b"}\n  maintainer: {who: "c"}\n  physicist: {who: "d"}\n', /keeper: only who: may be set/],
    ['voices:\n  keeper: {who: ""}\n  detective: {who: "b"}\n  maintainer: {who: "c"}\n  physicist: {who: "d"}\n', /keeper: who: is empty/],
    [`voices:\n  keeper: {who: "${'x'.repeat(81)}"}\n  detective: {who: "b"}\n  maintainer: {who: "c"}\n  physicist: {who: "d"}\n`, /keep it to 80/],
    ['voices:\n  keeper: {who: "a"}\n  keeper: {who: "b"}\n', /defined twice/],
    ['roles:\n  keeper: {who: "a"}\n', /must start with voices:/],
    ['', /empty/],
  ];
  for (const [text, reason] of cases) {
    const got = voices.load(write(tmp(), 'v.yaml', text));
    assert.equal(got.ok, false, text);
    assert.match(got.reasons.join('\n'), reason, text);
  }
});

test('trouble install writes the skill, the validator, and the defaults', () => {
  const home = tmp();
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  const res = trouble(['install', '--claude', '--codex'], { env });
  assert.equal(res.status, 0, res.stderr);
  const dest = path.join(home, '.claude', 'skills', 'trouble');
  for (const rel of ['SKILL.md', 'voices.default.yaml', 'tool/voices.js']) assert.equal(fs.existsSync(path.join(dest, rel)), true, rel);
  assert.equal(fs.existsSync(path.join(home, '.agents', 'skills', 'trouble', 'SKILL.md')), true);
  assert.equal(fs.existsSync(path.join(home, '.grok')), false);
  const installed = spawnSync(process.execPath, [path.join(dest, 'tool', 'voices.js'), 'check', path.join(dest, 'voices.default.yaml')], { encoding: 'utf8' });
  assert.equal(installed.status, 0, installed.stderr);
  const status = trouble(['status'], { env });
  assert.match(status.stdout, /\[x\] Anthropic Claude Code/);
  assert.match(status.stdout, /\[ \] xAI Grok/);
  assert.notEqual(trouble(['install', '--nope'], { env }).status, 0);
});

test('npm pack ships the skill and vendored core, not the tests', () => {
  const res = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: path.join(__dirname, '..'), encoding: 'utf8', shell: process.platform === 'win32' });
  assert.equal(res.status, 0, res.stderr);
  const files = JSON.parse(res.stdout)[0].files.map((f) => f.path);
  for (const want of ['LICENSE', 'README.md', 'bin/trouble.js', 'lib/skill.js', 'lib/core/index.js', 'skill/SKILL.md', 'skill/voices.default.yaml', 'skill/tool/voices.js', 'skill/package.json']) {
    assert.ok(files.includes(want), `missing ${want}`);
  }
  assert.deepEqual(files.filter((f) => f.startsWith('test/')), []);
  const pkg = require('../package.json');
  assert.equal(pkg.name, '@actvite/trouble');
  assert.deepEqual(pkg.bin, { trouble: 'bin/trouble.js' });
});
