'use strict';

/** Where things live in the monorepo. */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..');
// Published npm packages, in publish order: dependencies before the bundle.
const PUBLISHED = ['cela', 'trouble', 'ceci', 'cecicela'];
// The three skills the bundle carries, in the order users read them.
const SKILLS = ['ceci', 'cela', 'trouble'];

const core = require(path.join(REPO, 'packages', 'core', 'lib'));

function pkg(name) {
  return JSON.parse(fs.readFileSync(path.join(REPO, 'packages', name, 'package.json'), 'utf8'));
}

module.exports = { REPO, PUBLISHED, SKILLS, core, pkg };
