'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const BIN = path.join(ROOT, 'bin', 'cecicela.js');
const pkg = require('../package.json');
const run = (args, env = process.env) => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', env });

test('the bundle package depends on exactly the three skill packages', () => {
  assert.equal(pkg.name, '@actvite/cecicela');
  assert.deepEqual(pkg.bin, { cecicela: 'bin/cecicela.js' });
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ['@actvite/ceci', '@actvite/cela', '@actvite/trouble']);
  for (const [name, version] of Object.entries(pkg.dependencies)) assert.match(version, /^\d+\.\d+\.\d+$/, `${name} is pinned exactly`);
  assert.equal(pkg.license, 'GPL-3.0-or-later');
});

test('help, version, and errors', () => {
  const help = run(['--help']);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /cecicela install/);
  assert.match(help.stdout, /\/cecicela:ceci/);
  assert.equal(run([]).status, 2);
  assert.match(run(['--version']).stdout, /^cecicela \d+\.\d+\.\d+ \(ceci /);
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cecicela-cli-'));
  const bad = run(['install', '--claude', '--bogus'], { ...process.env, HOME: home, USERPROFILE: home });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /unknown option: --bogus/);
  assert.deepEqual(fs.readdirSync(home), [], 'nothing is written on a bad flag');
});

test('the front-door skill routes and never installs', () => {
  const skill = fs.readFileSync(path.join(ROOT, 'skill', 'SKILL.md'), 'utf8');
  assert.match(skill, /^---\nname: cecicela\n/);
  for (const name of ['/ceci', '/cela', '/trouble']) assert.ok(skill.includes(name), name);
  assert.match(skill, /Never install, update, or remove anything/);
});

test('npm pack ships the CLI, the front door, the Copilot agent, and the vendored core', () => {
  const res = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32' });
  assert.equal(res.status, 0, res.stderr);
  const files = JSON.parse(res.stdout)[0].files.map((f) => f.path);
  for (const want of ['LICENSE', 'README.md', 'bin/cecicela.js', 'lib/bundle.js', 'lib/core/index.js', 'skill/SKILL.md', 'agents/cecicela.agent.md']) assert.ok(files.includes(want), want);
  assert.deepEqual(files.filter((f) => f.startsWith('test/')), []);
});

test('update reinstalls only the skills each harness already has', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cecicela-update-'));
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  assert.equal(run(['install', '--claude', '--only', 'trouble'], env).status, 0);
  assert.equal(run(['update'], env).status, 0);
  const skills = fs.readdirSync(path.join(home, '.claude', 'skills')).sort();
  assert.ok(skills.includes('trouble'));
  assert.ok(!skills.includes('ceci') && !skills.includes('cela'), skills.join(','));
  assert.ok(!fs.existsSync(path.join(home, '.cela')), 'update must not install the cela core');
});
