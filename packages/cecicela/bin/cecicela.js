#!/usr/bin/env node
'use strict';

/**
 * ceciCela: ceci plans this, cela proves that, trouble fixes what breaks.
 *
 *   cecicela install [--all|--<harness> ...] [--force]
 *   cecicela status
 *   cecicela update [--force]
 *   cecicela uninstall --all | --<harness> ... | --dir PATH | --web [--purge] [--dry-run]
 *   cecicela --version
 */

function usage() {
  const { harness } = require('../lib/core');
  return `Usage:
  cecicela install [--all] [--<harness> ...] [--force]
  cecicela status
  cecicela update [--force]
  cecicela uninstall --all | --<harness> ... | --dir PATH | --web [--purge] [--dry-run]
  cecicela --version | --help

install writes /ceci, /cela, /trouble, and the /cecicela front door into each
harness you name (default: --all). ceciCela installs as one product: the three
skills always go in together, and npx @actvite/ceci, @actvite/cela, or
@actvite/trouble install does the same. --force replaces harness files you
edited (yours is kept as a backup).
${harness.selectorHelp('<skill>')}

update reinstalls all of ceciCela into every harness that has any part of it.
To move to a newer release: npx --yes @actvite/cecicela@latest update

Then restart the agent session and type /ceci, /cela, or /trouble.
In Claude Code a plugin namespaces them: /cecicela:ceci, /cecicela:cela, /cecicela:trouble.

uninstall removes /ceci, /cela, /trouble, and /cecicela together, and only
what ceciCela wrote; anything else is listed and kept. Name where:
  --all          everywhere on this machine: every harness and the cela engine
  --<harness>    just those harnesses
  --dir PATH     just one project: what cela init wrote there (bridges, skill
                 folders, the Claude Code Stop hook)
  --web          print the steps for Claude, ChatGPT, Grok, and Microsoft 365
                 (a command line cannot reach those accounts)
  --purge        also delete the cela memory (~/.cela), or the project's .cela/
  --dry-run      list what would be removed and change nothing
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
      let force = false;
      for (const arg of picked.rest) {
        if (arg === '--force') force = true;
        else if (arg === '--only' || arg.startsWith('--only=')) throw new Error('--only is gone: ceciCela installs /ceci, /cela, and /trouble together.');
        else throw new Error(`unknown option: ${arg}`);
      }
      const harnesses = picked.harnesses.length ? picked.harnesses : harness.IDS.slice();
      bundle.install({ harnesses, env: process.env, force, log });
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
    if (command === 'uninstall') return uninstall(rest, log);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    return 1;
  }
  process.stderr.write(usage());
  return 2;
}

const TARGETS = 'uninstall needs a target: --all (everywhere on this machine), --<harness>, --dir PATH (one project), or --web (the web apps).';

function uninstall(argv, log) {
  const { harness } = require('../lib/core');
  const bundle = require('../lib/bundle');
  const picked = harness.parseSelectors(argv);
  let dir = null;
  let web = false;
  let purge = false;
  let dryRun = false;
  for (let i = 0; i < picked.rest.length; i += 1) {
    const arg = picked.rest[i];
    if (arg === '--web') web = true;
    else if (arg === '--purge') purge = true;
    else if (arg === '--dry-run') dryRun = true;
    else if (arg === '--dir' || arg.startsWith('--dir=')) {
      dir = arg === '--dir' ? picked.rest[(i += 1)] : arg.slice('--dir='.length);
      if (!dir || dir.startsWith('--')) throw new Error('--dir needs a path');
    } else throw new Error(`unknown option: ${arg}`);
  }
  if (!picked.harnesses.length && !dir && !web) {
    process.stderr.write(`${TARGETS}\n`);
    return 2;
  }
  const ctx = bundle.uninstall({ harnesses: picked.harnesses, dir, env: process.env, purge, dryRun, log });
  if (picked.harnesses.length || dir) {
    const n = ctx.removed.length;
    if (!n) log('\nNothing of ceciCela was found there.');
    else log(dryRun ? `\nWould remove ${n} item(s); nothing changed. Run it again without --dry-run to remove them.` : `\nRemoved ${n} item(s). Restart the agent session.`);
    if (ctx.kept.length) log(`Kept ${ctx.kept.length} item(s) that ceciCela did not write, or that were edited (listed above).`);
    if (picked.harnesses.length === harness.IDS.length && !purge) log('The cela memory (~/.cela: memory, projects, registry) is kept; --purge deletes it.');
    if (dir && !purge) log('The project\'s .cela/ records are kept; --purge deletes them.');
    const plugins = picked.harnesses.filter((id) => bundle.PLUGIN_UNINSTALL[id]).map((id) => `  ${bundle.PLUGIN_UNINSTALL[id]}`);
    if (plugins.length) log(['If you added the ceciCela marketplace plugin, remove it with:', ...plugins].join('\n'));
  }
  if (web) log(`${picked.harnesses.length || dir ? '\n' : ''}${bundle.WEB_STEPS.join('\n')}`);
  return 0;
}

process.exit(main(process.argv.slice(2)));
