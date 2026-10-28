'use strict';

/**
 * The plan's acceptance criteria that a test can check (docs: README.md#acceptance).
 */

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const REPO = path.resolve(__dirname, '..');
const PUBLISHED = ['cela', 'trouble', 'ceci', 'cecicela'];
const sh = process.platform === 'win32';

/** Tracked text files under the given roots, with their contents. */
function trackedText(roots) {
  const files = spawnSync('git', ['ls-files', '-z', '--', ...roots], { cwd: REPO, encoding: 'utf8' }).stdout.split('\0').filter(Boolean);
  return files
    .map((rel) => ({ rel, buf: fs.readFileSync(path.join(REPO, rel)) }))
    .filter(({ buf }) => !buf.includes(0))
    .map(({ rel, buf }) => ({ rel, text: buf.toString('utf8') }));
}

test('git is available and the tree is tracked (these checks read git ls-files)', () => {
  const res = spawnSync('git', ['ls-files'], { cwd: REPO, encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  assert.ok(res.stdout.split('\n').length > 100);
});

test('nothing in the repository names the retired protocol', () => {
  const hits = trackedText(['.']).filter(({ rel }) => rel !== 'test/acceptance.test.js')
    .filter(({ text }) => /rdap/i.test(text)).map(({ rel }) => rel);
  assert.deepEqual(hits, []);
});

test('nothing in packages, bundle, or chat names the old personas', () => {
  const hits = trackedText(['packages', 'bundle', 'chat']).filter(({ text }) => /torvalds|brian cox|sherlock|star trek/i.test(text)).map(({ rel }) => rel);
  assert.deepEqual(hits, []);
});

test('the old owner and repository URLs are gone', () => {
  const hits = trackedText(['.']).filter(({ rel }) => !rel.startsWith('docs/archive/') && rel !== 'docs/release-runbook.md' && rel !== 'test/acceptance.test.js')
    .filter(({ text }) => /coldcanuk|users\.noreply\.github\.com/.test(text)).map(({ rel }) => rel);
  assert.deepEqual(hits, []);
});

test('generated files are current: npm run sync --check', () => {
  const res = spawnSync(process.execPath, [path.join(REPO, 'scripts', 'sync.js'), '--check'], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
});

test('every package version stamp matches its package.json', () => {
  const core = require(path.join(REPO, 'packages', 'core', 'lib'));
  for (const name of PUBLISHED) {
    const file = path.join(REPO, 'packages', name, 'lib', 'version-targets.js');
    if (!fs.existsSync(file)) continue;
    assert.deepEqual(core.versions.check(path.join(REPO, 'packages', name), require(file)), [], name);
  }
});

test('each npm package packs only files git tracks, even from a dirty checkout', (t) => {
  const planted = ['packages/ceci/.claude/settings.local.json', 'packages/cela/.agents/planted.txt', 'packages/trouble/skill/__pycache__/x.pyc', 'packages/cecicela/.grok/x.txt']
    .filter((rel) => !fs.existsSync(path.join(REPO, rel)));
  t.after(() => {
    for (const rel of planted) {
      fs.rmSync(path.join(REPO, rel), { force: true });
      fs.rmSync(path.dirname(path.join(REPO, rel)), { recursive: true, force: true });
    }
  });
  for (const rel of planted) {
    fs.mkdirSync(path.dirname(path.join(REPO, rel)), { recursive: true });
    fs.writeFileSync(path.join(REPO, rel), 'planted\n');
  }
  const tracked = new Set(spawnSync('git', ['ls-files'], { cwd: REPO, encoding: 'utf8' }).stdout.split('\n').filter(Boolean));
  for (const name of PUBLISHED) {
    const res = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: path.join(REPO, 'packages', name), encoding: 'utf8', shell: sh });
    assert.equal(res.status, 0, res.stderr);
    const files = JSON.parse(res.stdout)[0].files.map((f) => `packages/${name}/${f.path}`);
    const untracked = files.filter((rel) => !rel.endsWith('/package.json') && !tracked.has(rel));
    assert.deepEqual(untracked, [], name);
  }
});

test('.gitignore keeps harness folders and runtime state out, and the catalogs in', () => {
  const ignored = (rel) => spawnSync('git', ['check-ignore', '-q', '--no-index', rel], { cwd: REPO }).status === 0;
  for (const rel of ['.claude/settings.local.json', '.grok/rules.md', '.agents/skills/ceci/SKILL.md', '.codex/x', '.copilot/x', '.cline/x', '.goosehints', '.clinerules', '.ceci/x', '.cela/x', '.trouble/voices.yaml', '.worktrees/x', 'dist/release-plan.md', 'node_modules/x', 'chat/m365/appPackage/build/x.zip']) {
    assert.equal(ignored(rel), true, `${rel} should be ignored`);
  }
  for (const rel of ['.claude-plugin/marketplace.json', '.agents/plugins/marketplace.json', '.github/plugin/marketplace.json', '.grok-plugin/marketplace.json', 'chat/m365/env/.env.dev']) {
    assert.equal(ignored(rel), false, `${rel} must stay tracked`);
  }
  assert.equal(spawnSync('git', ['ls-files', '-ci', '--exclude-standard'], { cwd: REPO, encoding: 'utf8' }).stdout, '');
});

test('Node only: no Python outside the optional NeMo package', () => {
  const py = spawnSync('git', ['ls-files', '*.py'], { cwd: REPO, encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
  assert.deepEqual(py.filter((rel) => !rel.startsWith('packages/cela/nemo/')), []);
});

test('the old repositories have an archive notice ready', () => {
  for (const name of ['ceci', 'trouble']) {
    const notice = fs.readFileSync(path.join(REPO, 'docs', 'archive', `${name}.README.md`), 'utf8');
    assert.match(notice, /https:\/\/github\.com\/actviteai\/cecicela/);
    assert.match(notice, /archived/i);
  }
});
