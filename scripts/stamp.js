'use strict';

/**
 * npm run stamp: write each package's version into every place that repeats it.
 *
 *   - each package's prose and manifest stamps (packages/<pkg>/lib/version-targets.js)
 *   - @actvite/cecicela's dependencies, pinned to the exact skill versions
 *   - then npm run sync, which re-renders the plugin manifests, catalogs,
 *     bundle.json, and the chat pack from the new versions
 */

const fs = require('fs');
const path = require('path');
const { REPO, PUBLISHED, SKILLS, core, pkg } = require('./lib/repo');

function stampAll(log = () => {}) {
  for (const name of PUBLISHED) {
    const dir = path.join(REPO, 'packages', name);
    const file = path.join(dir, 'lib', 'version-targets.js');
    if (!fs.existsSync(file)) continue;
    const { version, changed } = core.versions.stamp(dir, require(file));
    log(changed.length ? `${name} ${version}: ${changed.join(', ')}` : `${name} ${version}: stamps current`);
  }
  const bundleFile = path.join(REPO, 'packages', 'cecicela', 'package.json');
  const bundle = JSON.parse(fs.readFileSync(bundleFile, 'utf8'));
  let pinned = false;
  for (const skill of SKILLS) {
    const want = pkg(skill).version;
    if (bundle.dependencies[`@actvite/${skill}`] !== want) {
      bundle.dependencies[`@actvite/${skill}`] = want;
      pinned = true;
    }
  }
  if (pinned) {
    fs.writeFileSync(bundleFile, `${JSON.stringify(bundle, null, 2)}\n`);
    log(`cecicela: dependencies pinned to ${SKILLS.map((s) => `${s} ${pkg(s).version}`).join(', ')}`);
  }
  const done = require('./sync').write();
  log(`sync: ${done.reduce((n, d) => n + d.count, 0)} generated file(s) checked`);
}

if (require.main === module) stampAll((line) => process.stdout.write(`${line}\n`));

module.exports = { stampAll };
