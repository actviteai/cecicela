'use strict';

/**
 * ceci as an installable skill: what it is, the trees each harness gets,
 * and install/status through the shared core. bin/ceci.js and the
 * @actvite/cecicela bundle both call this.
 */

const fs = require('fs');
const path = require('path');
const core = require('./core');
const hermes = require('./hermes');

const ROOT = path.resolve(__dirname, '..');
const NAME = 'ceci';
const SKILL_DIR = path.join(ROOT, 'skill');
const { version: VERSION } = require('../package.json');

/** The Hermes layout: a URL install copies only scripts/, references/, and examples/ files SKILL.md names. */
function hermesFiles(skillDir = SKILL_DIR) {
  const read = (rel) => fs.readFileSync(path.join(skillDir, rel), 'utf8');
  const files = new Map();
  files.set('SKILL.md', { text: hermes.renderHub(read('SKILL.md')), exec: false });
  files.set('scripts/ceci.js', { text: read('tool/ceci.js'), exec: false });
  files.set('scripts/tui.js', { text: read('tool/tui.js'), exec: false });
  files.set('scripts/graph-player.html', { text: read('tool/graph-player.html'), exec: false });
  files.set('scripts/package.json', { text: read('package.json'), exec: false });
  for (const name of fs.readdirSync(path.join(skillDir, 'playbooks')).sort()) {
    files.set(`references/${name}`, { text: read(`playbooks/${name}`), exec: false });
  }
  files.set('examples/gpu-prefs.yaml', { text: read('examples/gpu-prefs.yaml'), exec: false });
  return files;
}

function install({ harnesses, homes = core.harness.homes(), log = () => {} }) {
  return core.install.installSkill({
    name: NAME,
    source: SKILL_DIR,
    harnesses,
    homes,
    sourceFor: (id) => (id === 'hermes' ? hermesFiles() : SKILL_DIR),
    log,
  });
}

function status(homes = core.harness.homes()) {
  return core.install.status(NAME, homes);
}

module.exports = { NAME, ROOT, SKILL_DIR, VERSION, hermesFiles, install, status };
