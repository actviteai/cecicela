#!/usr/bin/env node
'use strict';

const path = require('path');
const { handoff } = require('../lib/core');
const { bundlePlan, runCli } = require('../lib/installer');

const pkgRoot = path.resolve(__dirname, '..');
const options = { pkgRoot, cwd: process.cwd(), env: process.env };

function main(argv) {
  if (argv[0] === 'uninstall') {
    process.stdout.write(`${handoff.UNINSTALL_NOTICE('cela')}\n`);
    return handoff.toBundle(argv, { from: pkgRoot, env: process.env });
  }
  const plan = bundlePlan(argv);
  if (!plan) return runCli(argv, options);
  if (!plan.quiet) process.stdout.write(`${handoff.NOTICE('cela')}\n`);
  const code = handoff.toBundle(plan.args, { from: pkgRoot, env: process.env, stdio: plan.quiet ? ['ignore', 'ignore', 'inherit'] : 'inherit' });
  if (code !== 0 || !plan.nemo) return code;
  return runCli(['install', '--nemo', ...(plan.force ? ['--force'] : []), ...(plan.quiet ? ['--quiet'] : [])], options);
}

process.exit(main(process.argv.slice(2)));
