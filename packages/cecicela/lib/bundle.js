'use strict';

/**
 * The ceciCela bundle: install, status, and update for /ceci, /cela, and
 * /trouble together, plus the thin /cecicela front-door skill.
 *
 * Each skill installs itself through its own package (@actvite/ceci,
 * @actvite/cela, @actvite/trouble): this module only chooses which ones and
 * where. The versions it was built from are in package.json dependencies,
 * pinned exactly at release.
 */

const path = require('path');
const core = require('./core');

const ROOT = path.resolve(__dirname, '..');
const NAME = 'cecicela';
const SKILL_DIR = path.join(ROOT, 'skill');
const AGENT_FILE = path.join(ROOT, 'agents', 'cecicela.agent.md');
const pkg = require('../package.json');

const SKILLS = {
  ceci: () => require('@actvite/ceci/lib/skill'),
  cela: () => require('@actvite/cela/lib/skill'),
  trouble: () => require('@actvite/trouble/lib/skill'),
};
const SKILL_IDS = Object.keys(SKILLS);

function versions() {
  const out = { cecicela: pkg.version };
  for (const id of SKILL_IDS) out[id] = SKILLS[id]().VERSION;
  return out;
}

function installFrontDoor({ harnesses, homes, log }) {
  return core.install.installSkill({ name: NAME, source: SKILL_DIR, harnesses, homes, log });
}

/** GitHub Copilot lists custom agents from ~/.copilot/agents; the bundle adds one so the three skills show in its picker. */
function installCopilotAgent({ homes, force, log }) {
  const dest = path.join(homes.copilot, 'agents', 'cecicela.agent.md');
  log(core.fsx.describePlace(core.fsx.placeConfigFile(AGENT_FILE, dest, { force, tag: NAME })));
}

function install({ harnesses, skills = SKILL_IDS, env = process.env, force = false, log = () => {} }) {
  const homes = core.harness.homes(env);
  for (const id of skills) {
    if (!SKILLS[id]) throw new Error(`unknown skill ${id}; choose from ${SKILL_IDS.join(', ')}`);
  }
  for (const id of skills) {
    const skill = SKILLS[id]();
    log(`==> ${id} ${skill.VERSION}`);
    if (id === 'cela') skill.install({ harnesses, env, force, log });
    else skill.install({ harnesses, homes, log });
  }
  log(`==> cecicela ${pkg.version} (front door)`);
  installFrontDoor({ harnesses, homes, log });
  if (harnesses.includes('copilot')) installCopilotAgent({ homes, force, log });
  return { homes, skills, harnesses };
}

/** Rows: harness label and, per skill, whether its SKILL.md is installed there. */
function status(env = process.env) {
  const homes = core.harness.homes(env);
  const ids = [...SKILL_IDS, NAME];
  const by = {};
  for (const id of ids) by[id] = core.install.status(id, homes);
  return core.harness.HARNESSES.map((h, i) => ({
    id: h.id,
    label: h.label,
    installed: Object.fromEntries(ids.map((id) => [id, by[id][i].installed])),
  }));
}

function formatStatus(rows) {
  const ids = [...SKILL_IDS, NAME];
  const head = `${'harness'.padEnd(28)} ${ids.map((id) => id.padEnd(9)).join(' ')}`;
  const lines = rows.map((row) => `${row.label.padEnd(28)} ${ids.map((id) => (row.installed[id] ? 'yes' : '-').padEnd(9)).join(' ')}`);
  return [head, ...lines].join('\n');
}

/** Reinstall each skill, and the front door, only into the harnesses that already have it. */
function update({ env = process.env, force = false, log = () => {} } = {}) {
  const rows = status(env);
  const harnesses = rows.filter((row) => Object.values(row.installed).some(Boolean)).map((row) => row.id);
  if (!harnesses.length) return { harnesses };
  const homes = core.harness.homes(env);
  for (const id of SKILL_IDS) {
    const where = rows.filter((row) => row.installed[id]).map((row) => row.id);
    if (!where.length) continue;
    const skill = SKILLS[id]();
    log(`==> ${id} ${skill.VERSION}`);
    if (id === 'cela') skill.install({ harnesses: where, env, force, log });
    else skill.install({ harnesses: where, homes, log });
  }
  const front = rows.filter((row) => row.installed[NAME]).map((row) => row.id);
  if (front.length) {
    log(`==> cecicela ${pkg.version} (front door)`);
    installFrontDoor({ harnesses: front, homes, log });
    if (front.includes('copilot')) installCopilotAgent({ homes, force, log });
  }
  return { harnesses };
}

module.exports = { AGENT_FILE, NAME, ROOT, SKILL_DIR, SKILL_IDS, formatStatus, install, status, update, versions };
