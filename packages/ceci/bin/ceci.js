#!/usr/bin/env node
'use strict';

/**
 * npm entry point.
 *
 *   ceci install [--all|--claude|--grok|--codex|...]       install all of ceciCela (the bundle) into harness homes
 *   ceci prep|init|status|event|feedback|log|archive|player|resolve-gpu --work-dir PATH  run the skill's tool
 *   ceci help [COMMAND]                                     the tool's usage or one command's page
 */

const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TOOL = path.join(ROOT, 'skill', 'tool', 'ceci.js');

function usage() {
  const { harness } = require('../lib/core');
  return `Usage:
  ceci install [--all] [--<harness> ...]
  ceci prep|init|status|event|feedback|log|archive|player|resolve-gpu --work-dir PATH [...]
  ceci help [COMMAND]        the task commands' usage, or one command's page
  ceci --help | --version

install hands off to @actvite/cecicela: ceciCela installs as one product, so
/ceci, /cela, /trouble, and the /cecicela front door go into each harness you
name (default: --all):
${harness.selectorHelp('<skill>')}

ceci is part of ceciCela: ceci plans this, cela proves that, trouble fixes what breaks.
`;
}

function install(argv) {
  const { handoff, harness } = require('../lib/core');
  const picked = harness.parseSelectors(argv);
  if (picked.rest.some((arg) => arg === '--help' || arg === '-h' || arg === '-help')) {
    process.stdout.write(usage());
    return 0;
  }
  if (picked.rest.length) throw new Error(`unknown option: ${picked.rest[0]}`);
  process.stdout.write(`${handoff.NOTICE('ceci')}\n`);
  return handoff.toBundle(['install', ...argv], { from: ROOT });
}

function main(argv) {
  const [command, ...rest] = argv;
  if (command === 'help' && rest.length) return tool(argv);
  if (!command || command === '--help' || command === '-h' || command === '-help' || command === 'help') {
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
  return tool(argv);
}

function tool(argv) {
  const res = spawnSync(process.execPath, [TOOL, ...argv], { stdio: 'inherit' });
  if (res.error) {
    process.stderr.write(`${res.error.message}\n`);
    return 1;
  }
  return res.status === null ? 1 : res.status;
}

process.exit(main(process.argv.slice(2)));
