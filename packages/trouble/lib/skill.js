'use strict';

/**
 * trouble as an installable skill: the same tree in every harness, through
 * the shared core. bin/trouble.js and the @actvite/cecicela bundle call this.
 */

const path = require('path');
const core = require('./core');

const ROOT = path.resolve(__dirname, '..');
const NAME = 'trouble';
const SKILL_DIR = path.join(ROOT, 'skill');
const { version: VERSION } = require('../package.json');

function install({ harnesses, homes = core.harness.homes(), log = () => {} }) {
  return core.install.installSkill({ name: NAME, source: SKILL_DIR, harnesses, homes, log });
}

function status(homes = core.harness.homes()) {
  return core.install.status(NAME, homes);
}

module.exports = { NAME, ROOT, SKILL_DIR, VERSION, install, status };
