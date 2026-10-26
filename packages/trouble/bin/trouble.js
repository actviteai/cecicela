#!/usr/bin/env node
'use strict';

/**
 * npm entry point. trouble has no run engine: the protocol is SKILL.md.
 *
 *   trouble install [--all|--<harness> ...]   copy the skill into harness homes
 *   trouble status                            where the skill is installed
 *   trouble voices resolve [--project DIR]    the role names /trouble will use here
 *   trouble voices check FILE                 validate a voices.yaml
 */

const path = require('path');

const VOICES = path.join(__dirname, '..', 'skill', 'tool', 'voices.js');

function usage() {
  const { harness } = require('../lib/core');
  return `Usage:
  trouble install [--all] [--<harness> ...]
  trouble status
  trouble voices resolve [--project DIR]
  trouble voices check FILE
  trouble --help | --version

Install writes the skill into each harness you name (default: --all):
${harness.selectorHelp('trouble')}

Rename the four roles with .trouble/voices.yaml in a project, or ~/.trouble/voices.yaml.
Start from skill/voices.default.yaml; only who: may change.

trouble is part of ceciCela: npm i -g @actvite/cecicela installs /ceci, /cela, and /trouble.
`;
}

function main(argv) {
  const [command, ...rest] = argv;
  if (!command || command === '--help' || command === '-h' || command === '-help' || command === 'help') {
    process.stdout.write(usage());
    return command ? 0 : 2;
  }
  if (command === '--version' || command === '-v') {
    process.stdout.write(`${require('../package.json').version}\n`);
    return 0;
  }
  const { harness, install } = require('../lib/core');
  const skill = require('../lib/skill');
  if (command === 'install') {
    const picked = harness.parseSelectors(rest);
    if (picked.rest.length) {
      process.stderr.write(`unknown option: ${picked.rest[0]}\n`);
      return 1;
    }
    const harnesses = picked.harnesses.length ? picked.harnesses : harness.IDS.slice();
    process.stdout.write(`trouble ${skill.VERSION}\n`);
    skill.install({ harnesses, homes: harness.homes(process.env), log: (line) => process.stdout.write(`${line}\n`) });
    process.stdout.write('Restart the agent session, then type /trouble.\n');
    return 0;
  }
  if (command === 'status') {
    process.stdout.write(`${install.formatStatus('trouble', skill.status(harness.homes(process.env)))}\n`);
    return 0;
  }
  if (command === 'voices') return require(VOICES).main(rest);
  process.stderr.write(usage());
  return 2;
}

process.exit(main(process.argv.slice(2)));
