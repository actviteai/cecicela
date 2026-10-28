'use strict';

/**
 * The ceciCela bundle: install, status, update, and uninstall for /ceci,
 * /cela, and /trouble together, plus the thin /cecicela front-door skill.
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

/** Install /ceci, /cela, /trouble, and the front door: ceciCela installs as one product, never a skill alone. */
function install({ harnesses, env = process.env, force = false, log = () => {} }) {
  const homes = core.harness.homes(env);
  for (const id of SKILL_IDS) {
    const skill = SKILLS[id]();
    log(`==> ${id} ${skill.VERSION}`);
    if (id === 'cela') skill.install({ harnesses, env, force, log });
    else skill.install({ harnesses, homes, log });
  }
  log(`==> cecicela ${pkg.version} (front door)`);
  installFrontDoor({ harnesses, homes, log });
  if (harnesses.includes('copilot')) installCopilotAgent({ homes, force, log });
  return { homes, harnesses };
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

/** Reinstall all of ceciCela into every harness that has any part of it, which also completes a partial install. */
function update({ env = process.env, force = false, log = () => {} } = {}) {
  const harnesses = status(env).filter((row) => Object.values(row.installed).some(Boolean)).map((row) => row.id);
  if (harnesses.length) install({ harnesses, env, force, log });
  return { harnesses };
}

/** The Copilot agent the bundle wrote, at any version. */
function ownsAgent(text) {
  return /^name: cecicela$/m.test(text) && text.includes('ceciCela front door');
}

// The web apps keep uploaded skills and Projects in the user's account, out of
// reach of a command line: uninstall --web prints these steps instead.
const WEB_STEPS = [
  'ceciCela in a web app is removed there, by hand; this command cannot reach your account.',
  '  Claude (claude.ai and the desktop app): Settings → Capabilities → Skills, delete ceci, cela,',
  '    trouble, and cecicela. A ceciCela Project: open it and delete it from its menu.',
  '  ChatGPT: delete the ceciCela Project from its menu.',
  '  Grok: delete the ceciCela Project from its menu.',
  '  Microsoft 365 Copilot: remove the ceciCela agent (Teams: Apps → Manage your apps); an agent',
  '    your organization deployed is removed by its admin.',
];

const PLUGIN_UNINSTALL = {
  claude: 'claude plugin uninstall cecicela@cecicela',
  grok: 'grok plugin uninstall cecicela --confirm',
  copilot: 'copilot plugin uninstall cecicela',
};

/** Every harness skill directory, rooted in project directory `dir` (.claude/skills, .agents/skills, ...). */
function projectHomes(dir) {
  return core.harness.homes({ HOME: dir }, 'linux');
}

/**
 * Remove ceciCela, and only what it installed. `harnesses`: the agent homes
 * to clear (every one of them also clears the cela engine in $CELA_HOME).
 * `dir`: a project directory, cleared of `cela init`'s files and any
 * ceciCela skill directory. `purge` also deletes the cela memory home or the
 * project's .cela/. Returns the context: what was removed and what was kept.
 */
function uninstall({ harnesses = [], dir = null, env = process.env, purge = false, dryRun = false, log = () => {} }) {
  if (dir) {
    const abs = path.resolve(dir);
    if (!core.fsx.exists(abs) || !require('fs').statSync(abs).isDirectory()) throw new Error(`directory does not exist: ${abs}`);
  }
  const ctx = core.uninstall.context({ dryRun, log });
  const names = [...SKILL_IDS, NAME];
  if (harnesses.length) {
    const homes = core.harness.homes(env);
    const everywhere = core.harness.IDS.every((id) => harnesses.includes(id));
    log(`==> ${everywhere ? 'every harness' : harnesses.map((id) => core.harness.byId(id).label).join(', ')}`);
    for (const name of names) {
      if (name === 'cela') SKILLS.cela().uninstall({ harnesses, env, everywhere, purge, ctx });
      else core.uninstall.removeSkill({ name, harnesses, homes, ctx });
    }
    if (harnesses.includes('copilot')) {
      const agent = path.join(homes.copilot, 'agents', 'cecicela.agent.md');
      core.uninstall.removeFile(agent, ownsAgent, ctx);
      core.uninstall.removeFile(`${agent}.${NAME}`, ownsAgent, ctx);
    }
  }
  if (dir) {
    const abs = path.resolve(dir);
    log(`==> ${abs}`);
    for (const name of names) core.uninstall.removeSkill({ name, harnesses: core.harness.IDS, homes: projectHomes(abs), ctx });
    SKILLS.cela().uninstallRepo(abs, { purge, ctx });
  }
  return ctx;
}

module.exports = { AGENT_FILE, NAME, PLUGIN_UNINSTALL, ROOT, SKILL_DIR, SKILL_IDS, WEB_STEPS, formatStatus, install, ownsAgent, status, uninstall, update, versions };
