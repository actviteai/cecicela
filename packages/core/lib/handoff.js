'use strict';

/**
 * ceciCela installs as one product. `ceci install`, `cela install`, and
 * `trouble install` hand off to the @actvite/cecicela bundle, which writes
 * /ceci, /cela, /trouble, and the /cecicela front door together; `uninstall`
 * hands off the same way and removes them together.
 *
 * A bundle that resolves from the calling package (a global install of
 * @actvite/cecicela, or this monorepo's workspaces) runs directly. Otherwise
 * npx fetches the latest bundle, the same network step that fetched the
 * calling package.
 */

const path = require('path');
const { spawnSync } = require('child_process');

const BUNDLE = '@actvite/cecicela';

/** The bundle's bin when one resolves from `from`, else null. */
function localBundle(from) {
  try {
    const manifest = require.resolve(`${BUNDLE}/package.json`, { paths: [from] });
    const bin = path.join(path.dirname(manifest), 'bin', 'cecicela.js');
    require('fs').accessSync(bin);
    return bin;
  } catch {
    return null;
  }
}

/** The command that runs `cecicela <args>`: [file, argv, spawn options]. */
function command(args, { from, platform = process.platform } = {}) {
  const bin = from ? localBundle(from) : null;
  if (bin) return [process.execPath, [bin, ...args], {}];
  // npx is a .cmd shim on Windows, which spawn runs only through a shell.
  return ['npx', ['--yes', `${BUNDLE}@latest`, ...args], { shell: platform === 'win32' }];
}

/** Run `cecicela <args>` and return its exit code. */
function toBundle(args, { from, env = process.env, stdio = 'inherit' } = {}) {
  const [file, argv, extra] = command(args, { from });
  const res = spawnSync(file, argv, { env, stdio, ...extra });
  if (res.error) throw new Error(`could not run ${BUNDLE}: ${res.error.message}`);
  return res.status === null ? 1 : res.status;
}

const NOTICE = (skill) => `${skill} is part of ceciCela: installing /ceci, /cela, /trouble, and the /cecicela front door together.`;
const UNINSTALL_NOTICE = (skill) => `${skill} is part of ceciCela: uninstalling /ceci, /cela, /trouble, and the /cecicela front door together.`;

module.exports = { BUNDLE, NOTICE, UNINSTALL_NOTICE, command, localBundle, toBundle };
