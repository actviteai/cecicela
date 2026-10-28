'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const BIN = path.join(ROOT, 'bin', 'ceci.js');
const pkg = require('../package.json');

function ceci(args, env = process.env) {
  return spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', env });
}

test('package.json is the published npm package', () => {
  assert.equal(pkg.name, '@actvite/ceci');
  assert.equal(pkg.license, 'GPL-3.0-or-later');
  assert.deepEqual(pkg.bin, { ceci: 'bin/ceci.js' });
  assert.equal(pkg.publishConfig.access, 'public');
  assert.equal(pkg.repository.directory, 'packages/ceci');
  assert.match(fs.readFileSync(path.join(ROOT, 'LICENSE'), 'utf8'), /GNU GENERAL PUBLIC LICENSE\s+Version 3, 29 June 2007/);
  if (process.platform !== 'win32') assert.equal((fs.statSync(BIN).mode & 0o111) !== 0, true);
  for (const word of ['Claude Code', 'Codex', 'Grok', 'Cline', 'Goose', 'Hermes', '/ceci', '/cela']) assert.ok(pkg.description.includes(word), word);
});

test('bin prints its version and usage', () => {
  const version = ceci(['--version']);
  assert.equal(version.status, 0);
  assert.equal(version.stdout.trim(), pkg.version);
  assert.equal(ceci([]).status, 2);
  assert.match(ceci(['--help']).stdout, /ceci install/);
  assert.match(ceci(['--help']).stdout, /\|feedback\|/, 'the usage lists every task command, feedback included');
});

test('bin forwards task commands to the skill tool', () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ceci-bin-'));
  assert.equal(ceci(['init', '--work-dir', work]).status, 0);
  for (const name of ['brief.md', 'state.md', 'log.md']) assert.equal(fs.existsSync(path.join(work, name)), true);
  const status = ceci(['status', '--work-dir', work]);
  assert.equal(status.status, 0);
  assert.match(status.stdout, /ready:/);
  assert.notEqual(ceci(['bogus']).status, 0);
});

test('bin install writes all of ceciCela into the harness home', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ceci-home-'));
  const env = { ...process.env, HOME: home, USERPROFILE: home, LOCALAPPDATA: path.join(home, "AppData", "Local"), CLAUDE_HOME: path.join(home, 'claude') };
  const res = ceci(['install', '--claude'], env);
  assert.equal(res.status, 0, res.stderr);
  const dest = path.join(home, 'claude', 'skills', 'ceci');
  assert.equal(fs.readFileSync(path.join(dest, 'SKILL.md'), 'utf8'), fs.readFileSync(path.join(ROOT, 'skill', 'SKILL.md'), 'utf8'));
  assert.deepEqual(fs.readdirSync(path.join(home, 'claude', 'skills')).sort(), ['ceci', 'cecicela', 'cela', 'trouble'], 'ceci installs as part of ceciCela');
  assert.match(res.stdout, /ceci is part of ceciCela/);
  assert.equal(fs.existsSync(path.join(home, '.grok')), false, 'only the named harness');
  assert.notEqual(ceci(['install', '--nope'], env).status, 0);
});

test('npm pack ships the skill, the vendored core, and no tests', () => {
  const res = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32' });
  assert.equal(res.status, 0, res.stderr);
  const files = JSON.parse(res.stdout)[0].files.map((f) => f.path);
  for (const want of [
    'LICENSE', 'README.md', 'package.json', 'bin/ceci.js', 'lib/skill.js', 'lib/hermes.js', 'lib/core/index.js', 'lib/core/install.js',
    'skill/SKILL.md', 'skill/tool/ceci.js', 'skill/tool/tui.js', 'skill/tool/graph-player.html', 'skill/playbooks/start.md', 'skill/package.json', 'skill/playbooks/cela.md', 'skill/examples/gpu-prefs.yaml',
  ]) assert.ok(files.includes(want), `missing ${want}`);
  assert.deepEqual(files.filter((f) => f.endsWith('.test.js') || f.startsWith('test/')), []);
});

test('npm pkg fix leaves package.json alone, so publish keeps every field', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ceci-pkgfix-'));
  const original = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8');
  fs.writeFileSync(path.join(dir, 'package.json'), original);
  const res = spawnSync('npm', ['pkg', 'fix'], { cwd: dir, encoding: 'utf8', shell: process.platform === 'win32' });
  assert.equal(res.status, 0, res.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')), JSON.parse(original));
});
