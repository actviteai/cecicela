'use strict';

/**
 * package.json is each package's only version source. Every manifest and
 * prose stamp a package lists must match it. Ported from cela's former
 * check-versions.js and stamp-version.js, made per-package.
 *
 *   targets = {
 *     json:  [[rel, ['path', 'to', 'version']], ...],  // manifests
 *     prose: [rel, ...],                              // every semver must be the version
 *     none:  [rel, ...],                              // must not hardcode a semver
 *   }
 *
 * A prose line carrying KEEP may name other versions (history, baselines).
 */

const fs = require('fs');
const path = require('path');

const SEMVER = /(?<![\d.])\d+\.\d+\.\d+(?![\d.])/g;
const KEEP = '<!-- keep-version -->';
const stampable = (text) => text.split('\n').filter((line) => !line.includes(KEEP)).join('\n');

function pick(data, keys) {
  return keys.reduce((node, key) => (node == null ? undefined : node[key]), data);
}

function versionOf(root) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (!pkg.version || typeof pkg.version !== 'string') throw new Error(`${root}/package.json is missing a version`);
  return pkg.version;
}

function check(root, targets) {
  const version = versionOf(root);
  const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
  const failures = [];
  for (const [rel, keys] of targets.json || []) {
    const found = pick(JSON.parse(read(rel)), keys);
    if (found !== version) failures.push(`${rel}: expected ${version}, found ${found}`);
  }
  for (const rel of targets.prose || []) {
    const found = stampable(read(rel)).match(SEMVER) || [];
    if (!found.includes(version)) failures.push(`${rel}: does not mention ${version}`);
    for (const hit of found) if (hit !== version) failures.push(`${rel}: stray version ${hit} (run npm run stamp)`);
  }
  for (const rel of targets.none || []) {
    for (const hit of read(rel).match(SEMVER) || []) failures.push(`${rel}: hardcoded version ${hit} (read package.json instead)`);
  }
  return failures;
}

function stamp(root, targets) {
  const version = versionOf(root);
  const changed = [];
  const update = (rel, next) => {
    const file = path.join(root, rel);
    const text = fs.readFileSync(file, 'utf8');
    const out = next(text);
    if (out !== text) {
      fs.writeFileSync(file, out);
      changed.push(rel);
    }
  };
  for (const [rel, keys] of targets.json || []) {
    update(rel, (text) => {
      const old = pick(JSON.parse(text), keys);
      if (typeof old !== 'string') throw new Error(`${rel}: no version at ${keys.join('.')}`);
      if (old === version) return text;
      const field = new RegExp(`("version"\\s*:\\s*")${old.replace(/\./g, '\\.')}(")`, 'g');
      const out = text.replace(field, `$1${version}$2`);
      if (pick(JSON.parse(out), keys) !== version) throw new Error(`${rel}: could not rewrite ${keys.join('.')} from ${old}`);
      return out;
    });
  }
  for (const rel of targets.prose || []) {
    update(rel, (text) => text.split('\n').map((line) => (line.includes(KEEP) ? line : line.replace(SEMVER, version))).join('\n'));
  }
  return { version, changed };
}

module.exports = { KEEP, SEMVER, check, pick, stamp, stampable, versionOf };
