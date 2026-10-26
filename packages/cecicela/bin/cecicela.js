#!/usr/bin/env node
'use strict';

/**
 * ceciCela: ceci plans this, cela proves that, trouble fixes what breaks.
 *
 *   cecicela install [--all|--<harness> ...] [--only ceci,cela,trouble] [--force]
 *   cecicela status
 *   cecicela update [--force]
 *   cecicela --version
 */

function usage() {
  const { harness } = require('../lib/core');
  return `Usage:
  cecicela install [--all] [--<harness> ...] [--only ceci,cela,trouble] [--force]
  cecicela status
  cecicela update [--force]
  cecicela --version | --help

install writes /ceci, /cela, /trouble, and the /cecicela front door into each
harness you name (default: --all). --only limits the skills. --force replaces
harness files you edited (yours is kept as a backup).
${harness.selectorHelp('<skill>')}

update reinstalls into every harness that already has any of the skills.
To move to a newer release: npx --yes @actvite/cecicela@latest update

Then restart the agent session and type /ceci, /cela, or /trouble.
In Claude Code a plugin namespaces them: /cecicela:ceci, /cecicela:cela, /cecicela:trouble.
`;
}

function main(argv) {
  const [command, ...rest] = argv;
  if (!command || command === '--help' || command === '-h' || command === '-help' || command === 'help') {
    process.stdout.write(usage());
    return command ? 0 : 2;
  }
  const bundle = require('../lib/bundle');
  if (command === '--version' || command === '-v') {
    const v = bundle.versions();
    process.stdout.write(`cecicela ${v.cecicela} (ceci ${v.ceci}, cela ${v.cela}, trouble ${v.trouble})\n`);
    return 0;
  }
  const { harness } = require('../lib/core');
  const log = (line) => process.stdout.write(`${line}\n`);
  try {
    if (command === 'install') {
      const picked = harness.parseSelectors(rest);
      let skills;
      let force = false;
      for (let i = 0; i < picked.rest.length; i += 1) {
        const arg = picked.rest[i];
        if (arg === '--force') force = true;
        else if (arg === '--only') {
          skills = String(picked.rest[i + 1] || '').split(',').filter(Boolean);
          i += 1;
          if (!skills.length) throw new Error('--only needs a list: ceci,cela,trouble');
        } else if (arg.startsWith('--only=')) skills = arg.slice(7).split(',').filter(Boolean);
        else throw new Error(`unknown option: ${arg}`);
      }
      const harnesses = picked.harnesses.length ? picked.harnesses : harness.IDS.slice();
      bundle.install({ harnesses, skills, env: process.env, force, log });
      log('\nDone. Restart the agent session, then type /ceci, /cela, or /trouble (or /cecicela if you are not sure which).');
      return 0;
    }
    if (command === 'status') {
      log(bundle.formatStatus(bundle.status(process.env)));
      return 0;
    }
    if (command === 'update') {
      const extra = rest.filter((a) => a !== '--force');
      if (extra.length) throw new Error(`unknown option: ${extra[0]}`);
      const { harnesses } = bundle.update({ env: process.env, force: rest.includes('--force'), log });
      log(harnesses.length ? `\nUpdated ${harnesses.length} harness(es). Restart the agent session.` : 'Nothing installed yet. Run: cecicela install --all');
      return 0;
    }
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    return 1;
  }
  process.stderr.write(usage());
  return 2;
}

process.exit(main(process.argv.slice(2)));
