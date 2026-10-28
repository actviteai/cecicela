'use strict';

/**
 * cela as an installable skill, for @actvite/cecicela. `cela install` itself
 * runs lib/installer.js; this is the same install without the banner.
 */

const path = require('path');
const core = require('./core');
const installer = require('./installer');

const ROOT = path.resolve(__dirname, '..');
const NAME = 'cela';
const SKILL_DIR = path.join(ROOT, 'skill');
const { version: VERSION } = require('../package.json');

/** Installs the core ($CELA_HOME) and the named harnesses, with cela's Claude command and Hermes render. */
function install({ harnesses, env = process.env, force = false, log = () => {} }) {
  const layout = installer.install({ harnesses: harnesses.filter((id) => id !== 'nemo'), env, force, log, pkgRoot: ROOT });
  return harnesses.map((id) => ({ id, dest: core.harness.skillDests(id, layout, NAME)[0] }));
}

/** Removes cela from the named harnesses; `everywhere` also takes the engine out of the core home ($CELA_HOME). */
function uninstall({ harnesses, env = process.env, everywhere = false, purge = false, ctx }) {
  return installer.uninstall({ harnesses, env, everywhere, purge, ctx });
}

/** Undoes `cela init` in one directory. */
function uninstallRepo(dir, { purge = false, ctx }) {
  return installer.uninstallRepo(dir, { purge, ctx });
}

function status(homes = core.harness.homes()) {
  return core.install.status(NAME, homes);
}

module.exports = { NAME, ROOT, SKILL_DIR, VERSION, install, status, uninstall, uninstallRepo };
