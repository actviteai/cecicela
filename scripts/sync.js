'use strict';

/**
 * Every generated, committed file in the repository, rendered from its source.
 *
 *   node scripts/sync.js           rewrite everything that drifted
 *   node scripts/sync.js --check   exit 1 if anything is stale (CI runs this)
 *   node scripts/sync.js --only vendor,bundle,chat
 *
 * Sources: packages/core/lib, packages/<skill>/skill, chat/src. Outputs:
 * packages/<pkg>/lib/core, bundle/, the root plugin catalogs, chat/pack, and
 * chat/<host>/. Nothing generated is edited by hand.
 */

const { REPO, core } = require('./lib/repo');

const GROUPS = {
  vendor: () => require('./targets/vendor').targets(),
  bundle: () => require('./targets/bundle').targets(),
  chat: () => require('./targets/chat').targets(),
};

function allTargets(only) {
  const names = only && only.length ? only : Object.keys(GROUPS);
  return names.flatMap((name) => {
    if (!GROUPS[name]) throw new Error(`unknown group ${name}`);
    return GROUPS[name]();
  });
}

function drift(only) {
  return core.gen.drift(REPO, allTargets(only));
}

function write(only) {
  // Vendor first: the bundle and chat renders load package code that requires lib/core.
  const names = only && only.length ? only : Object.keys(GROUPS);
  const done = [];
  for (const name of names) done.push(...core.gen.write(REPO, GROUPS[name]()));
  return done;
}

if (require.main === module) {
  const at = process.argv.indexOf('--only');
  const only = at === -1 ? null : String(process.argv[at + 1] || '').split(',').filter(Boolean);
  if (process.argv.includes('--check')) {
    const problems = drift(only);
    if (problems.length) {
      process.stderr.write(`${problems.join('\n')}\nrun: npm run sync\n`);
      process.exit(1);
    }
    process.stdout.write('generated files are up to date\n');
  } else {
    const done = write(only);
    const total = done.reduce((n, d) => n + d.count, 0);
    process.stdout.write(`synced ${total} file(s) in ${done.length} target(s)\n`);
  }
}

module.exports = { allTargets, drift, write };
