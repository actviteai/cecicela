'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const core = require('../lib/core');
const hermes = require('../lib/hermes');
const skill = require('../lib/skill');

function tmpHomes(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return { root, homes: core.harness.homes({ HOME: root }, 'linux') };
}

test('the Hermes render is a valid URL-install skill that names every file it needs', () => {
  const files = skill.hermesFiles();
  const hub = files.get('SKILL.md').text;
  assert.deepEqual(hermes.checkFrontmatter(hub), []);
  assert.equal(hub.includes('disable-model-invocation'), false);
  for (const rel of files.keys()) {
    if (rel !== 'SKILL.md') assert.ok(hub.includes(rel), `SKILL.md must name ${rel}`);
    assert.match(rel, /^(SKILL\.md|scripts\/|references\/|examples\/)/);
  }
  assert.equal(files.get('scripts/ceci.js').text, fs.readFileSync(path.join(skill.SKILL_DIR, 'tool', 'ceci.js'), 'utf8'));
  assert.match(hub, /references\/cela\.md/);
});

test('install writes a real skill tree for every harness, once per shared directory', () => {
  const { homes } = tmpHomes('ceci-homes-');
  const written = skill.install({ harnesses: core.harness.IDS, homes });
  assert.deepEqual(written.filter((w) => w.shared).map((w) => w.id), ['goose']);
  for (const id of core.harness.IDS.filter((h) => h !== 'hermes')) {
    for (const dest of core.harness.skillDests(id, homes, 'ceci')) {
      const file = path.join(dest, 'SKILL.md');
      assert.equal(fs.lstatSync(file).isSymbolicLink(), false, id);
      assert.equal(fs.readFileSync(file, 'utf8'), fs.readFileSync(path.join(skill.SKILL_DIR, 'SKILL.md'), 'utf8'), id);
      assert.equal(fs.existsSync(path.join(dest, 'tool', 'ceci.js')), true, id);
      assert.equal(fs.existsSync(path.join(dest, 'tool', 'tui.js')), true, id);
    }
  }
  const hermesDir = core.harness.skillDests('hermes', homes, 'ceci')[0];
  assert.deepEqual(hermes.checkFrontmatter(fs.readFileSync(path.join(hermesDir, 'SKILL.md'), 'utf8')), []);
  assert.equal(fs.existsSync(path.join(hermesDir, 'scripts', 'ceci.js')), true);
  assert.equal(fs.existsSync(path.join(hermesDir, 'tool', 'ceci.js')), false);
  // Antigravity reads two directories.
  assert.equal(core.harness.skillDests('antigravity', homes, 'ceci').length, 2);
});

test('installed engines run under an ancestor package.json with type module', () => {
  const { root, homes } = tmpHomes('ceci-esm-');
  fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}\n');
  skill.install({ harnesses: ['claude', 'codex', 'hermes'], homes });
  for (const file of [
    path.join(core.harness.skillDests('claude', homes, 'ceci')[0], 'tool', 'ceci.js'),
    path.join(core.harness.skillDests('codex', homes, 'ceci')[0], 'tool', 'ceci.js'),
    path.join(core.harness.skillDests('hermes', homes, 'ceci')[0], 'scripts', 'ceci.js'),
  ]) {
    const result = spawnSync(process.execPath, [file], { encoding: 'utf8' });
    assert.equal(result.status, 2, `${file}\n${result.stderr}`);
    assert.match(result.stderr, /usage: ceci/);
  }
});

test('a reinstall replaces the tree and leaves no staging directories behind', () => {
  const { homes } = tmpHomes('ceci-again-');
  skill.install({ harnesses: ['claude'], homes });
  const dest = core.harness.skillDests('claude', homes, 'ceci')[0];
  fs.writeFileSync(path.join(dest, 'stray.txt'), 'old');
  skill.install({ harnesses: ['claude'], homes });
  assert.equal(fs.existsSync(path.join(dest, 'stray.txt')), false);
  assert.deepEqual(fs.readdirSync(path.dirname(dest)), ['ceci']);
});
