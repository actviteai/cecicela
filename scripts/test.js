'use strict';

/**
 * npm test: everything CI runs, in order, stopping at the first failure.
 *
 *   1. generated files are current (sync --check)
 *   2. the shared core and the repository-level tests
 *   3. each package's own suite (cela also runs its static checks)
 *
 * Node only. The NeMo pytest suite is a separate, optional CI job.
 */

const { spawnSync } = require('child_process');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const WIN = process.platform === 'win32';

const steps = [
  ['generated files', process.execPath, [path.join('scripts', 'sync.js'), '--check'], REPO],
  ['core and repository', process.execPath, ['--test', '--test-concurrency=1', 'packages/core/test/*.test.js', 'test/*.test.js'], REPO],
  ...['cela', 'trouble', 'ceci', 'cecicela'].map((name) => [`@actvite/${name}`, 'npm', ['test', '--silent'], path.join(REPO, 'packages', name)]),
];

for (const [label, cmd, args, cwd] of steps) {
  process.stdout.write(`\n== ${label}\n`);
  const res = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: WIN && cmd === 'npm' });
  if (res.status !== 0) {
    process.stderr.write(`\nnpm test: ${label} failed\n`);
    process.exit(res.status || 1);
  }
}
process.stdout.write('\nnpm test: all suites passed\n');
