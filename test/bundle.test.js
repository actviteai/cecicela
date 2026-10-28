'use strict';

/**
 * The bundle and the plugin catalogs. The catalog checks are ported from
 * trouble's tests/test_skill_structure.py, now covering all four plugins.
 */

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const REPO = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const json = (rel) => JSON.parse(read(rel));
const pkg = (name) => json(`packages/${name}/package.json`);
const PLUGINS = ['cecicela', 'ceci', 'cela', 'trouble'];
const SKILLS_OF = { cecicela: ['cecicela', 'ceci', 'cela', 'trouble'], ceci: ['ceci'], cela: ['cela'], trouble: ['trouble'] };
const CATALOGS = ['.claude-plugin/marketplace.json', '.grok-plugin/marketplace.json', '.github/plugin/marketplace.json', '.agents/plugins/marketplace.json'];

function sourcePath(entry) {
  if (typeof entry.source === 'string') return entry.source;
  return entry.source.path;
}

function tree(dir, prefix = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...tree(path.join(dir, e.name), rel));
    else out.push(rel);
  }
  return out.sort();
}

test('every catalog lists the bundle and each skill, pointing at a plugin with its SKILL.md files', () => {
  for (const rel of CATALOGS) {
    const catalog = json(rel);
    assert.equal(catalog.name, 'cecicela', rel);
    assert.deepEqual(catalog.plugins.map((p) => p.name), PLUGINS, rel);
    for (const entry of catalog.plugins) {
      const dir = path.join(REPO, sourcePath(entry));
      assert.ok(fs.statSync(dir).isDirectory(), `${rel}: ${entry.name}`);
      for (const skill of SKILLS_OF[entry.name]) assert.ok(fs.existsSync(path.join(dir, 'skills', skill, 'SKILL.md')), `${rel}: ${entry.name} lacks ${skill}`);
    }
  }
});

test('each host reads the source shape it expects', () => {
  for (const entry of json('.claude-plugin/marketplace.json').plugins) assert.equal(entry.source, `./bundle/plugins/${entry.name}`);
  for (const entry of json('.github/plugin/marketplace.json').plugins) {
    assert.equal(typeof entry.source, 'string');
    assert.equal(entry.skills, 'skills/');
  }
  for (const entry of json('.grok-plugin/marketplace.json').plugins) assert.deepEqual(entry.source, { type: 'local', path: `./bundle/plugins/${entry.name}` });
  for (const entry of json('.agents/plugins/marketplace.json').plugins) {
    assert.deepEqual(entry.source, { source: 'local', path: `./bundle/plugins/${entry.name}` });
    assert.deepEqual(entry.policy, { installation: 'AVAILABLE', authentication: 'ON_INSTALL' });
    assert.ok(entry.category);
  }
  assert.equal(fs.existsSync(path.join(REPO, '.deepseek-plugin')), false, 'DeepSeek has no git marketplace catalog');
  assert.equal(fs.existsSync(path.join(REPO, 'marketplace.json')), false, 'a root marketplace.json breaks Copilot, which reads it first');
});

test('plugin manifests carry the package versions, the license, and the actvite owner', () => {
  for (const plugin of PLUGINS) {
    const version = pkg(plugin).version;
    for (const rel of ['plugin.json', '.claude-plugin/plugin.json', '.codex-plugin/plugin.json']) {
      const m = json(`bundle/plugins/${plugin}/${rel}`);
      assert.equal(m.name, plugin);
      assert.equal(m.version, version, `${plugin}/${rel}`);
      assert.equal(m.license, 'GPL-3.0-or-later');
      assert.equal(m.author.email, 'chuck@actvite.com');
      assert.match(m.homepage, /^https:\/\/github\.com\/actviteai\/cecicela/);
    }
    for (const rel of CATALOGS.slice(0, 3)) assert.equal(json(rel).plugins.find((p) => p.name === plugin).version, version, `${rel} ${plugin}`);
  }
  assert.equal(json('bundle/plugins/trouble/.codex-plugin/plugin.json').skills, './skills/');
});

test('the bundle records the exact skill versions it was built from, matching its npm dependencies', () => {
  const built = json('bundle/plugins/cecicela/bundle.json');
  const deps = pkg('cecicela').dependencies;
  for (const skill of ['ceci', 'cela', 'trouble']) {
    assert.equal(built.skills[skill], pkg(skill).version, skill);
    assert.equal(deps[`@actvite/${skill}`], pkg(skill).version, `@actvite/cecicela pins @actvite/${skill} exactly`);
  }
  assert.equal(built.version, pkg('cecicela').version);
  assert.equal(pkg('ceci').version, '2.3.3', '@actvite/ceci 1.0.0 and 2.0.0 are already on npm');
  assert.equal(pkg('cecicela').version, '1.3.4', '@actvite/cecicela 1.0.0 is already on npm');
  assert.equal(pkg('cela').version, '1.0.4', '@actvite/cela 1.0.0 is already on npm');
  assert.equal(pkg('trouble').version, '1.0.2', '@actvite/trouble 1.0.0 is already on npm');
});

test('plugin skill copies are real files, byte for byte the package skill', () => {
  for (const plugin of PLUGINS) {
    for (const skill of SKILLS_OF[plugin]) {
      const src = path.join(REPO, 'packages', skill, 'skill');
      const copy = path.join(REPO, 'bundle', 'plugins', plugin, 'skills', skill);
      assert.equal(fs.lstatSync(copy).isSymbolicLink(), false);
      assert.deepEqual(tree(copy), tree(src), `${plugin}/${skill}`);
      for (const rel of tree(src)) assert.deepEqual(fs.readFileSync(path.join(copy, rel)), fs.readFileSync(path.join(src, rel)), `${plugin}/${skill}/${rel}`);
    }
  }
});

// Marketplace review holds a plugin whose code both names a remote host and reads something
// credential-named (an env var, or an identifier like FOO_TOKENS). The tools need neither.
test('plugin tool code names no remote host and no credential', () => {
  for (const name of PLUGINS) {
    const tools = path.join(REPO, 'bundle', 'plugins', name, 'skills');
    for (const skill of fs.readdirSync(tools)) {
      const dir = path.join(tools, skill, 'tool');
      if (!fs.existsSync(dir)) continue;
      for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
        const text = fs.readFileSync(path.join(dir, file), 'utf8');
        const where = `${name}/skills/${skill}/tool/${file}`;
        assert.doesNotMatch(text, /\bhttps?:/, `${where} names a remote host`);
        assert.doesNotMatch(text, /\b[A-Z_]*(TOKENS?|API_?KEY|PASSWORD|CREDENTIALS?)[A-Z_]*\b/, `${where} has a credential-named identifier`);
      }
    }
  }
});

test('the Hermes copies are valid URL installs', () => {
  const ceciHermes = require(path.join(REPO, 'packages/ceci/lib/hermes'));
  const celaHermes = require(path.join(REPO, 'packages/cela/lib/hermes'));
  assert.deepEqual(ceciHermes.checkFrontmatter(read('bundle/hermes/ceci/SKILL.md')), []);
  assert.deepEqual(celaHermes.checkFrontmatter(read('bundle/hermes/cela/SKILL.md'), pkg('cela').version), []);
  for (const skill of ['ceci', 'cela']) {
    const hub = read(`bundle/hermes/${skill}/SKILL.md`);
    for (const rel of tree(path.join(REPO, 'bundle', 'hermes', skill))) if (rel !== 'SKILL.md') assert.ok(hub.includes(rel), `${skill}: SKILL.md must name ${rel}`);
    assert.doesNotMatch(hub, /\btool\/|\bplaybooks\//, skill);
  }
  assert.equal(read('bundle/hermes/cela/scripts/cela.js'), read('packages/cela/skill/tool/cela.js'));
});

function cecicela(args, home) {
  return spawnSync(process.execPath, [path.join(REPO, 'packages', 'cecicela', 'bin', 'cecicela.js'), ...args], { encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home, LOCALAPPDATA: path.join(home, "AppData", "Local") } });
}

test('npm i -g @actvite/cecicela: install puts /ceci, /cela, /trouble, and /cecicela into every harness', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cecicela-all-'));
  const res = cecicela(['install', '--all'], home);
  assert.equal(res.status, 0, res.stderr);
  const core = require(path.join(REPO, 'packages', 'core', 'lib'));
  const homes = core.harness.homes({ HOME: home }, process.platform);
  for (const id of core.harness.IDS) {
    for (const skill of ['ceci', 'cela', 'trouble', 'cecicela']) {
      for (const dest of core.harness.skillDests(id, homes, skill)) assert.ok(fs.existsSync(path.join(dest, 'SKILL.md')), `${id} ${skill}`);
    }
  }
  assert.ok(fs.existsSync(path.join(home, '.cela', 'skills', 'cela', 'tool', 'cela.js')), 'the cela core');
  assert.ok(fs.existsSync(path.join(home, '.claude', 'commands', 'cela.md')), 'the /cela command bridge');
  assert.ok(fs.existsSync(path.join(home, '.copilot', 'agents', 'cecicela.agent.md')), 'the Copilot agent');
  const status = cecicela(['status'], home);
  assert.equal(status.status, 0);
  assert.equal(status.stdout.split('\n').filter((l) => / yes {7}yes {7}yes {7}yes/.test(l)).length, 9);
  const update = cecicela(['update'], home);
  assert.equal(update.status, 0, update.stderr);
  assert.match(update.stdout, /Updated 9 harness\(es\)/);
  assert.match(cecicela(['--version'], home).stdout, /^cecicela 1\.3\.4 \(ceci 2\.3\.3, cela 1\.0\.4, trouble 1\.0\.2\)/);
});

test('installing any one skill package installs all of ceciCela, and --only is refused', () => {
  const skillBin = (name) => path.join(REPO, 'packages', name, 'bin', `${name}.js`);
  const alone = fs.mkdtempSync(path.join(os.tmpdir(), 'trouble-install-'));
  const res = spawnSync(process.execPath, [skillBin('trouble'), 'install', '--claude'], { encoding: 'utf8', env: { ...process.env, HOME: alone, USERPROFILE: alone, LOCALAPPDATA: path.join(alone, "AppData", "Local") } });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /trouble is part of ceciCela/);
  assert.deepEqual(fs.readdirSync(path.join(alone, '.claude', 'skills')).sort(), ['ceci', 'cecicela', 'cela', 'trouble']);
  assert.ok(fs.existsSync(path.join(alone, '.cela', 'skills', 'cela', 'tool', 'cela.js')), 'the cela core comes too');
  assert.equal(fs.existsSync(path.join(alone, '.grok')), false, 'only the named harness');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cecicela-only-'));
  for (const args of [['install', '--claude', '--only', 'trouble'], ['install', '--only=ceci']]) {
    const refused = cecicela(args, home);
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /installs \/ceci, \/cela, and \/trouble together/);
  }
  assert.deepEqual(fs.readdirSync(home), [], 'a refused install writes nothing');
});

test('nothing update can find means nothing is written', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cecicela-empty-'));
  const res = cecicela(['update'], home);
  assert.equal(res.status, 0);
  assert.match(res.stdout, /Nothing installed yet/);
  assert.deepEqual(fs.readdirSync(home), []);
});
