'use strict';

/**
 * npm run release: prepare a release. It never publishes. CI holds no npm
 * token; a maintainer publishes by hand, from the staged tarballs, with npm
 * two-factor authentication.
 *
 *   npm run release                               stamp, sync, test, stage, write the plan
 *   npm run release -- --bump trouble=patch       bump first (patch|minor|major|x.y.z); the bundle
 *                                                 gets a patch bump when a skill moves and it does not
 *   npm run release -- --skip-tests               when you just ran npm test
 *   npm run release -- --offline                  do not ask the registry what is published
 *
 * Writes:
 *   dist/tarballs/<pkg>.tgz       the exact bytes to publish (npm pack)
 *   dist/stage/<pkg>/             a 0.0.0-stage placeholder, for a name npm has never seen
 *   dist/release-plan.md          what changed, the tarball contents, and the commands, in order
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { REPO, PUBLISHED, SKILLS, pkg } = require('./lib/repo');

const WIN = process.platform === 'win32';
const DIST = path.join(REPO, 'dist');
const npm = (args, opts = {}) => spawnSync('npm', args, { cwd: REPO, encoding: 'utf8', shell: WIN, ...opts });

function parseArgs(argv) {
  const opts = { bump: {}, skipTests: false, offline: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--skip-tests') opts.skipTests = true;
    else if (arg === '--offline') opts.offline = true;
    else if (arg === '--bump') {
      for (const pair of String(argv[i + 1] || '').split(',').filter(Boolean)) {
        const [name, how] = pair.split('=');
        if (!PUBLISHED.includes(name) || !how) throw new Error(`--bump takes <pkg>=<patch|minor|major|x.y.z>; packages: ${PUBLISHED.join(', ')}`);
        opts.bump[name] = how;
      }
      i += 1;
    } else throw new Error(`unknown option: ${arg}`);
  }
  return opts;
}

function next(version, how) {
  if (/^\d+\.\d+\.\d+$/.test(how)) return how;
  const [major, minor, patch] = version.split('.').map(Number);
  if (how === 'major') return `${major + 1}.0.0`;
  if (how === 'minor') return `${major}.${minor + 1}.0`;
  if (how === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`cannot bump by ${how}`);
}

function bump(plan) {
  const names = Object.keys(plan);
  if (names.some((n) => SKILLS.includes(n)) && !plan.cecicela) plan.cecicela = 'patch';
  for (const [name, how] of Object.entries(plan)) {
    const file = path.join(REPO, 'packages', name, 'package.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const was = data.version;
    data.version = next(was, how);
    fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
    process.stdout.write(`bumped @actvite/${name} ${was} -> ${data.version}\n`);
  }
}

// Keep package-lock.json in step, or the next npm ci reads the old versions.
// Runs after stamp, which re-pins the bundle's dependencies: before it, the
// lock would pin the bundle to the old skill versions and fetch them from npm.
function relock() {
  const lock = npm(['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund']);
  if (lock.status !== 0) throw new Error(`could not update package-lock.json: ${lock.stderr}`);
}

/** What npm knows: 'new name', 'new version', 'published', or 'unknown'. */
function registry(name, version, offline) {
  if (offline) return { state: 'unknown', note: 'not checked (--offline)' };
  const res = npm(['view', `@actvite/${name}`, 'versions', '--json'], { timeout: 30000 });
  if (res.status === 0) {
    let versions = [];
    try {
      versions = [].concat(JSON.parse(res.stdout));
    } catch {
      return { state: 'unknown', note: 'npm view returned something unexpected' };
    }
    return versions.includes(version)
      ? { state: 'published', note: `${version} is already on npm; it cannot be published again`, versions }
      : { state: 'new version', note: `on npm: ${versions.join(', ')}`, versions };
  }
  if (/E404|404 Not Found/.test(`${res.stderr}${res.stdout}`)) return { state: 'new name', note: 'npm has no package by this name yet' };
  return { state: 'unknown', note: 'the registry did not answer; check with npm view before publishing' };
}

function stage(name) {
  const out = path.join(DIST, 'tarballs');
  fs.mkdirSync(out, { recursive: true });
  const res = npm(['pack', '--json', '--ignore-scripts', '--pack-destination', out], { cwd: path.join(REPO, 'packages', name) });
  if (res.status !== 0) throw new Error(`npm pack failed for ${name}: ${res.stderr}`);
  const info = JSON.parse(res.stdout)[0];
  return { file: path.join('dist', 'tarballs', info.filename), files: info.files.map((f) => f.path), size: info.size, unpacked: info.unpackedSize, integrity: info.integrity };
}

function placeholder(name) {
  const dir = path.join(DIST, 'stage', name);
  fs.mkdirSync(dir, { recursive: true });
  const real = pkg(name);
  fs.writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify({
    name: real.name,
    version: '0.0.0-stage',
    description: 'Temporary package placeholder for staged publishing',
    stub: true,
    license: real.license,
    repository: real.repository,
    publishConfig: { access: 'public' },
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, 'README.md'), `# ${real.name}\n\nPlaceholder for staged publishing. The real package follows as ${real.version}; see https://github.com/actviteai/cecicela.\n`);
  return path.join('dist', 'stage', name);
}

function writePlan(rows, tested) {
  const order = rows.filter((r) => r.reg.state !== 'published');
  const lines = [
    '# Release plan',
    '',
    `Prepared by \`npm run release\`. Nothing has been published. ${tested ? '`npm test` passed before staging.' : 'Tests were skipped (`--skip-tests`); run `npm test` before publishing.'}`,
    '',
    '| package | version | npm today | tarball |',
    '| --- | --- | --- | --- |',
    ...rows.map((r) => `| \`${pkg(r.name).name}\` | ${pkg(r.name).version} | ${r.reg.state}: ${r.reg.note} | \`${r.stage.file}\` (${r.stage.files.length} files, ${r.stage.size} bytes) |`),
    '',
    '## Tag first',
    '',
    'Merge the stamped versions to `main` through a pull request first. Then, on an up-to-date `main`, tag every package that moves and push the tags one at a time: GitHub creates no push event when more than three tags arrive in one push, so the `release` workflow would never run. Wait for it to pass on every tag before publishing anything.',
    '',
    '```bash',
    ...order.map((r) => `git tag ${r.name}@${pkg(r.name).version}`),
    `for t in ${order.map((r) => `${r.name}@${pkg(r.name).version}`).join(' ')}; do git push origin "$t"; done`,
    '```',
    '',
    'Publish in this order, so each dependency exists before the package that needs it: cela, trouble, ceci, then cecicela. Check each with `npm view` before moving on. Use your npm account with two-factor authentication; npm asks for the one-time code.',
    '',
  ];
  if (!order.length) lines.push('Every package version is already on npm. Bump with `npm run release -- --bump <pkg>=patch` first.', '');
  order.forEach((r, i) => {
    const p = pkg(r.name);
    lines.push(`## ${i + 1}. ${p.name} ${p.version}`, '');
    const cmds = [];
    if (r.reg.state === 'new name' || r.reg.state === 'unknown') {
      lines.push(r.reg.state === 'new name'
        ? 'First publish of this name: the placeholder goes first, as for the earlier packages.'
        : 'If `npm view` says the name does not exist, publish the placeholder first; otherwise skip it.', '');
      cmds.push(`npm publish ${r.placeholder} --access public --tag stage   # npm needs a tag for a prerelease version`);
    }
    cmds.push(`npm publish ${r.stage.file} --access public`);
    if (r.placeholder) cmds.push(`npm dist-tag rm ${p.name} stage   # skip if npm says the tag does not exist`);
    cmds.push(`npm view ${p.name} versions dist-tags   # latest must be ${p.version}`);
    lines.push('```bash', ...cmds, '```', '');
  });
  lines.push(
    '## After publishing',
    '',
    'Deprecate the superseded packages (once all four are live):',
    '',
    '```bash',
    'npm deprecate "@actvite/ceci@<2.0.0" "superseded by @actvite/ceci 2.x in ceciCela: npx @actvite/cecicela install --all"',
    '# optional: hide each placeholder',
    ...rows.map((r) => `npm deprecate ${pkg(r.name).name}@0.0.0-stage "placeholder; install ${pkg(r.name).version} or later"`),
    '```',
    '',
    'Then replace each old repository\'s README with its notice in `docs/archive/`, and archive actviteai/ceci and actviteai/trouble on GitHub.',
    '',
    '## Tarball contents',
    '',
    ...rows.flatMap((r) => [`<details><summary>${pkg(r.name).name} ${pkg(r.name).version}: ${r.stage.files.length} files</summary>`, '', '```text', ...r.stage.files, '```', '', '</details>', '']),
  );
  fs.writeFileSync(path.join(DIST, 'release-plan.md'), `${lines.join('\n')}\n`);
}

function main(argv) {
  const opts = parseArgs(argv);
  if (Object.keys(opts.bump).length) bump(opts.bump);
  require('./stamp').stampAll((line) => process.stdout.write(`${line}\n`));
  if (Object.keys(opts.bump).length) relock();
  if (!opts.skipTests) {
    const res = npm(['test'], { stdio: 'inherit', encoding: undefined });
    if (res.status !== 0) throw new Error('npm test failed; nothing was staged');
  }
  fs.rmSync(path.join(DIST, 'tarballs'), { recursive: true, force: true });
  fs.rmSync(path.join(DIST, 'stage'), { recursive: true, force: true });
  const rows = PUBLISHED.map((name) => {
    const reg = registry(name, pkg(name).version, opts.offline);
    const row = { name, reg, stage: stage(name) };
    if (reg.state !== 'published' && reg.state !== 'new version') row.placeholder = placeholder(name);
    return row;
  });
  writePlan(rows, !opts.skipTests);
  process.stdout.write('\nStaged. Read dist/release-plan.md; publish by hand in the order it lists.\n');
  return rows;
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}

module.exports = { main, next, parseArgs };
