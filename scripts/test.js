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
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const WIN = process.platform === 'win32';

// The suites make their scratch folders with mkdtemp in the temp dir and leave
// them there (about 140 a run). Point every suite at one folder of its own and
// remove it when the run ends, pass or fail.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cecicela-test-'));
const env = { ...process.env, TMPDIR: TMP, TMP, TEMP: TMP };
process.on('exit', () => {
  try {
    fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 3 });
  } catch (err) {
    process.stderr.write(`npm test: could not remove ${TMP}: ${err.message}\n`);
  }
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => process.exit(130));

const steps = [
  ['generated files', process.execPath, [path.join('scripts', 'sync.js'), '--check'], REPO],
  ['core and repository', process.execPath, ['--test', '--test-concurrency=1', 'packages/core/test/*.test.js', 'test/*.test.js'], REPO],
  ...['cela', 'trouble', 'ceci', 'cecicela'].map((name) => [`@actvite/${name}`, 'npm', ['test', '--silent'], path.join(REPO, 'packages', name)]),
];

for (const [label, cmd, args, cwd] of steps) {
  process.stdout.write(`\n== ${label}\n`);
  const res = spawnSync(cmd, args, { cwd, env, stdio: 'inherit', shell: WIN && cmd === 'npm' });
  if (res.status !== 0) {
    process.stderr.write(`\nnpm test: ${label} failed\n`);
    process.exit(res.status || 1);
  }
}
process.stdout.write('\nnpm test: all suites passed\n');
