'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const REPO = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));

test('npm pack includes the skill, bridges, vendored core, and no tests, eval, or Python', () => {
  const result = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: REPO, encoding: 'utf8', shell: process.platform === 'win32' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  const paths = ((Array.isArray(parsed) ? parsed[0] : parsed).files || []).map((file) => file.path);
  for (const want of [
    'LICENSE',
    'README.md',
    'bin/cela.js',
    'skill/SKILL.md',
    'skill/tool/cela.js',
    'skill/package.json',
    'skill/playbooks/audit.md',
    'lib/installer.js',
    'lib/skill.js',
    // install --hermes renders SKILL.md with lib/hermes.js at install time.
    'lib/hermes.js',
    'lib/core/index.js',
    'lib/core/harness.js',
    // install --claude and init copy these into the harness and the project.
    'bridges/project.md',
    'bridges/claude/commands/cela.md',
  ]) assert.ok(paths.includes(want), `missing ${want}`);
  assert.deepEqual(paths.filter((rel) => /^(test|eval|nemo)\//.test(rel) || rel.endsWith('.test.js')), []);
  assert.deepEqual(paths.filter((rel) => /^\.(claude|grok|agents|agent|codex|copilot|cline|goose)\/|^\.(clinerules|goosehints)$/.test(rel)), []);
});

test('package.json points at the ceciCela repository', () => {
  assert.equal(pkg.repository.url, 'git+https://github.com/actviteai/cecicela.git');
  assert.equal(pkg.repository.directory, 'packages/cela');
  assert.equal(pkg.bugs.url, 'https://github.com/actviteai/cecicela/issues');
});

test('the npm package is @actvite/cela with one bin', () => {
  assert.equal(pkg.name, '@actvite/cela');
  assert.equal(pkg.publishConfig && pkg.publishConfig.access, 'public');
  assert.deepEqual(pkg.bin, { cela: 'bin/cela.js' });
  assert.equal(pkg.license, 'GPL-3.0-or-later');
  assert.match(pkg.description, /\/cela/);
});

test('npm pkg fix leaves package.json alone, so publish keeps every field', () => {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'cela-pkgfix-'));
  const original = fs.readFileSync(path.join(REPO, 'package.json'), 'utf8');
  fs.writeFileSync(path.join(dir, 'package.json'), original);
  const res = spawnSync('npm', ['pkg', 'fix'], { cwd: dir, encoding: 'utf8', shell: process.platform === 'win32' });
  assert.equal(res.status, 0, res.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')), JSON.parse(original));
});

test('the nemo pip package wraps this engine and carries this version', () => {
  const pyproject = fs.readFileSync(path.join(REPO, 'nemo', 'pyproject.toml'), 'utf8');
  assert.match(pyproject, /^name = "cela-nat"$/m);
  assert.match(pyproject, new RegExp(`^version = "${pkg.version.replace(/\./g, '\\.')}"$`, 'm'));
  assert.match(pyproject, /authors = \[\{ name = "actvite", email = "chuck@actvite\.com" \}\]/);
});
