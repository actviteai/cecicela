#!/usr/bin/env node
'use strict';

/**
 * npm entry point.
 *
 *   ceci install [--all|--claude|--grok|--codex|...]       copy the skill into harness homes
 *   ceci init|status|event|log|resolve-gpu --work-dir PATH  run the skill's tool
 */

const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TOOL = path.join(ROOT, 'skill', 'tool', 'ceci.js');

function usage() {
  const { harness } = require('../lib/core');
  return `Usage:
  ceci install [--all] [--<harness> ...]
  ceci init|status|event|log|resolve-gpu --work-dir PATH [...]
  ceci --help | --version

Install writes the skill into each harness you name (default: --all):
${harness.selectorHelp('ceci')}

ceci is part of ceciCela: npm i -g @actvite/cecicela installs /ceci, /cela, and /trouble.
`;
}

function install(argv) {
  const { harness } = require('../lib/core');
  const skill = require('../lib/skill');
  const picked = harness.parseSelectors(argv);
  if (picked.rest.includes('--help') || picked.rest.includes('-h')) {
    process.stdout.write(usage());
    return 0;
  }
  if (picked.rest.length) throw new Error(`unknown option: ${picked.rest[0]}`);
  const harnesses = picked.harnesses.length ? picked.harnesses : harness.IDS.slice();
  process.stdout.write(`ceci ${skill.VERSION}\n`);
  skill.install({ harnesses, homes: harness.homes(process.env), log: (line) => process.stdout.write(`${line}\n`) });
  process.stdout.write('Restart the agent session, then type /ceci.\n');
  return 0;
}

function main(argv) {
  const [command, ...rest] = argv;
  if (!command || command === '--help' || command === '-h' || command === 'help') {
    process.stdout.write(usage());
    return command ? 0 : 2;
  }
  if (command === '--version' || command === '-v') {
    process.stdout.write(`${require('../package.json').version}\n`);
    return 0;
  }
  if (command === 'install') {
    try {
      return install(rest);
    } catch (err) {
      process.stderr.write(`${err.message}\n`);
      return 1;
    }
  }
  const res = spawnSync(process.execPath, [TOOL, ...argv], { stdio: 'inherit' });
  if (res.error) {
    process.stderr.write(`${res.error.message}\n`);
    return 1;
  }
  return res.status === null ? 1 : res.status;
}

process.exit(main(process.argv.slice(2)));
