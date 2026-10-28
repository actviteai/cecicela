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
  const bad = run(['install', '--claude', '--bogus'], { ...process.env, HOME: home, USERPROFILE: home, LOCALAPPDATA: path.join(home, "AppData", "Local") });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /unknown option: --bogus/);
  assert.deepEqual(fs.readdirSync(home), [], 'nothing is written on a bad flag');
});

test('every ceciCela command line answers --help, -h, and -help', () => {
  const pkgs = path.resolve(ROOT, '..');
  const clis = ['cecicela/bin/cecicela.js', 'ceci/bin/ceci.js', 'ceci/skill/tool/ceci.js', 'cela/bin/cela.js', 'cela/skill/tool/cela.js', 'trouble/bin/trouble.js', 'trouble/skill/tool/voices.js'];
  for (const cli of clis) {
    for (const flag of ['--help', '-h', '-help']) {
      const res = spawnSync(process.execPath, [path.join(pkgs, cli), flag], { encoding: 'utf8' });
      assert.equal(res.status, 0, `${cli} ${flag}: ${res.stderr}`);
      assert.ok(res.stdout.length > 40, `${cli} ${flag} prints its help on stdout`);
    }
  }
});

test('the front-door skill routes and never installs', () => {
  const skill = fs.readFileSync(path.join(ROOT, 'skill', 'SKILL.md'), 'utf8');
  assert.match(skill, /^---\nname: cecicela\n/);
  for (const name of ['/ceci', '/cela', '/trouble']) assert.ok(skill.includes(name), name);
  assert.match(skill, /Never install, update, or remove anything/);
  for (const text of [skill, fs.readFileSync(path.join(ROOT, 'agents', 'cecicela.agent.md'), 'utf8')]) {
    assert.match(text, /ceci asks about an existing plan and the animation before it starts\./);
    assert.match(text, /--resume.*--fresh.*--animate/);
  }
});

test('the front door offers a start menu, a help card, prompt tuning, and feedback the user files', () => {
  const skill = fs.readFileSync(path.join(ROOT, 'skill', 'SKILL.md'), 'utf8');
  for (const choice of ['Start something new', 'Review what is remembered', 'See all options', 'Improve my prompt']) assert.ok(skill.includes(`**${choice}**`), choice);
  const card = skill.match(/## Help card\n[\s\S]*?```text\n([\s\S]*?)```/)[1];
  for (const cmd of ['/ceci <goal>', '/cela <task>', '/trouble <error>', '/cecicela optimize', '/cecicela memories', '/cecicela feedback', 'budget low|medium|creator', 'animate chat|terminal|off', 'ceci help']) assert.ok(card.includes(cmd), cmd);
  assert.ok(card.includes('/cecicela uninstall'), 'the help card lists uninstall');
  for (const step of ['uninstall --all', 'uninstall --dir <path>', 'Settings → Capabilities → Skills', 'Do not run any of these yourself']) assert.ok(skill.includes(step), step);
  assert.match(skill, /--budget low\|medium\|creator/);
  assert.match(skill, /Read, never guess/);
  const optimize = fs.readFileSync(path.join(ROOT, 'skill', 'playbooks', 'optimize.md'), 'utf8');
  assert.match(optimize, /never run it until the user says so/);
  assert.match(optimize, /\[assumed: \.\.\.\]/);
  assert.match(optimize, /\*\*run it\*\*.*\*\*edit it\*\*.*\*\*keep mine\*\*/);
  const feedback = fs.readFileSync(path.join(ROOT, 'skill', 'playbooks', 'feedback.md'), 'utf8');
  for (const verdict of ['good', 'adjust', 'retry', 'report']) assert.match(feedback, new RegExp(`\\| ${verdict} \\|`), verdict);
  assert.match(feedback, /https:\/\/github\.com\/actviteai\/cecicela\/issues\/new\?title=/);
  assert.match(feedback, /The user files it\. Never open, post, or submit it yourself\./);
  assert.match(feedback, /Never argue with the verdict, and never record words the user did not say\./);
  assert.match(feedback, /ceci\.js feedback --work-dir/);
  const agent = fs.readFileSync(path.join(ROOT, 'agents', 'cecicela.agent.md'), 'utf8');
  assert.match(agent, /load the `cecicela` skill: it offers the start menu/);
  assert.match(agent, /good, adjust, retry another way, or report/);
});

test('npm pack ships the CLI, the front door, the Copilot agent, and the vendored core', () => {
  const res = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32' });
  assert.equal(res.status, 0, res.stderr);
  const files = JSON.parse(res.stdout)[0].files.map((f) => f.path);
  for (const want of ['LICENSE', 'README.md', 'bin/cecicela.js', 'lib/bundle.js', 'lib/core/index.js', 'skill/SKILL.md', 'skill/playbooks/optimize.md', 'skill/playbooks/feedback.md', 'agents/cecicela.agent.md']) assert.ok(files.includes(want), want);
  assert.deepEqual(files.filter((f) => f.startsWith('test/')), []);
});

test('update installs all of ceciCela into each harness that has any part of it', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cecicela-update-'));
  const env = { ...process.env, HOME: home, USERPROFILE: home, LOCALAPPDATA: path.join(home, "AppData", "Local") };
  // A partial install from before 1.4: trouble alone, in Claude Code only.
  const core = require('../lib/core');
  require('@actvite/trouble/lib/skill').install({ harnesses: ['claude'], homes: core.harness.homes(env) });
  const res = run(['update'], env);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /Updated 1 harness\(es\)/);
  assert.deepEqual(fs.readdirSync(path.join(home, '.claude', 'skills')).sort(), ['ceci', 'cecicela', 'cela', 'trouble']);
  assert.ok(fs.existsSync(path.join(home, '.cela', 'skills', 'cela', 'tool', 'cela.js')), 'the cela core');
  assert.equal(fs.existsSync(path.join(home, '.grok')), false, 'harnesses with nothing stay untouched');
});
