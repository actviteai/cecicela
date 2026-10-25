'use strict';

/**
 * File primitives shared by every ceciCela installer.
 *
 * Skill trees are staged next to their destination and renamed into place;
 * the previous tree is removed only after the staged copy verifies. Personal
 * harness files are never replaced unless the caller passes `force`: a
 * skipped write leaves the packaged bytes in a sidecar, a forced write keeps
 * the previous bytes in a backup.
 *
 * Generated: packages/core/lib is the source. `npm run sync` copies it into
 * each package's lib/core/ so every npm tarball is self-contained.
 */

const fs = require('fs');
const path = require('path');

// Editor and OS litter that must never become part of a copy.
const JUNK = /^(\.DS_Store|Thumbs\.db|[Dd]esktop\.ini|__pycache__|.*\.py[cod])$/;

function exists(target) {
  try {
    fs.lstatSync(target);
    return true;
  } catch (err) {
    if (err && err.code === 'ENOENT') return false;
    throw err;
  }
}

function isLink(target) {
  try {
    return fs.lstatSync(target).isSymbolicLink();
  } catch {
    return false;
  }
}

function isExec(file) {
  return (fs.statSync(file).mode & 0o111) !== 0;
}

/** Every regular file under dir, relative with forward slashes, sorted. Junk is skipped. */
function listFiles(dir, prefix = '') {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (JUNK.test(entry.name)) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listFiles(path.join(dir, entry.name), rel));
    else out.push(rel);
  }
  return out.sort();
}

/**
 * Copy a file or directory. Symlinks are reproduced, never followed, and
 * rejected when they point outside `root` or at nothing. Junk is skipped.
 */
function copyTreeSafe(src, dest, root = src) {
  const st = fs.lstatSync(src);
  if (st.isSymbolicLink()) {
    const link = fs.readlinkSync(src);
    const resolved = path.resolve(path.dirname(src), link);
    const rel = path.relative(root, resolved);
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error(`refusing outbound symlink ${src} -> ${link}`);
    }
    if (!exists(resolved)) throw new Error(`refusing dangling symlink ${src} -> ${link}`);
    fs.symlinkSync(link, dest);
    return;
  }
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      if (JUNK.test(name)) continue;
      copyTreeSafe(path.join(src, name), path.join(dest, name), root);
    }
    return;
  }
  if (st.isFile()) {
    fs.copyFileSync(src, dest);
    if ((st.mode & 0o111) !== 0) fs.chmodSync(dest, 0o755);
    return;
  }
  throw new Error(`unsupported filesystem entry: ${src}`);
}

function assertRegularFile(target, label) {
  if (!exists(target)) return;
  const st = fs.lstatSync(target);
  if (st.isSymbolicLink()) throw new Error(`refusing to follow symlink ${label || target}`);
  if (!st.isFile()) throw new Error(`refusing to replace non-file ${label || target}`);
}

/**
 * Publish `src` (a directory, or a Map of rel -> { text, exec }) to `dest`.
 * The staged copy must contain SKILL.md before anything is swapped.
 * `renderSkill` may rewrite the staged SKILL.md before the swap.
 */
function publishTree(src, dest, { renderSkill } = {}) {
  if (!(src instanceof Map) && !exists(src)) throw new Error(`source tree does not exist: ${src}`);
  const parent = path.dirname(dest);
  fs.mkdirSync(parent, { recursive: true });
  const token = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const staging = path.join(parent, `.${path.basename(dest)}.staging-${token}`);
  const backup = path.join(parent, `.${path.basename(dest)}.backup-${token}`);
  let movedAside = false;
  try {
    if (src instanceof Map) {
      for (const [rel, file] of src) {
        const out = path.join(staging, rel);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, file.text);
        if (file.exec) fs.chmodSync(out, 0o755);
      }
    } else {
      copyTreeSafe(src, staging, src);
    }
    const skillMd = path.join(staging, 'SKILL.md');
    if (!exists(skillMd)) throw new Error(`staged copy is missing SKILL.md; left ${dest} untouched`);
    if (renderSkill) {
      assertRegularFile(skillMd, skillMd);
      fs.writeFileSync(skillMd, renderSkill(fs.readFileSync(skillMd, 'utf8')));
    }
    if (exists(dest)) {
      fs.renameSync(dest, backup);
      movedAside = true;
    }
    fs.renameSync(staging, dest);
    if (movedAside) fs.rmSync(backup, { recursive: true, force: true });
  } catch (err) {
    if (exists(staging)) fs.rmSync(staging, { recursive: true, force: true });
    if (movedAside && !exists(dest) && exists(backup)) fs.renameSync(backup, dest);
    throw err;
  }
}

/**
 * Write a harness file. Existing different content is kept unless `force`.
 * A skipped write leaves the packaged bytes at `dest.<tag>`; a forced
 * replacement keeps the previous bytes at `dest.<tag>-backup`. `render`
 * may rewrite the packaged text before it is compared or written.
 */
function placeConfigFile(src, dest, { force = false, render, content, tag = 'cecicela' } = {}) {
  let raw;
  if (content !== undefined) {
    raw = Buffer.from(content, 'utf8');
  } else {
    if (!exists(src)) throw new Error(`missing packaged file: ${src}`);
    assertRegularFile(src, src);
    raw = fs.readFileSync(src);
  }
  const packaged = render ? Buffer.from(render(raw.toString('utf8')), 'utf8') : raw;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (!exists(dest)) {
    fs.writeFileSync(dest, packaged);
    return { action: 'created', dest };
  }
  assertRegularFile(dest, dest);
  const current = fs.readFileSync(dest);
  if (current.equals(packaged)) return { action: 'unchanged', dest };
  if (!force) {
    const sidecar = `${dest}.${tag}`;
    assertRegularFile(sidecar, sidecar);
    fs.writeFileSync(sidecar, packaged);
    return { action: 'kept', dest, sidecar };
  }
  const backup = `${dest}.${tag}-backup`;
  assertRegularFile(backup, backup);
  fs.writeFileSync(backup, current);
  fs.writeFileSync(dest, packaged);
  return { action: 'replaced', dest, backup };
}

function describePlace(result) {
  if (result.action === 'merged') return `    + merged into ${result.dest} (backup: ${result.backup})`;
  if (result.action === 'created') return `    + created ${result.dest}`;
  if (result.action === 'unchanged') return `    = unchanged ${result.dest}`;
  if (result.action === 'kept') return `    ! kept existing ${result.dest} (pass --force to replace). Proposed copy: ${result.sidecar}`;
  return `    + replaced ${result.dest} (backup: ${result.backup})`;
}

/** A directory as a Map of rel -> { text, exec }, for generated copies. */
function readTree(dir) {
  const files = new Map();
  for (const rel of listFiles(dir)) {
    const file = path.join(dir, rel);
    files.set(rel, { text: fs.readFileSync(file, 'utf8'), exec: isExec(file) });
  }
  return files;
}

module.exports = {
  JUNK,
  assertRegularFile,
  copyTreeSafe,
  describePlace,
  exists,
  isExec,
  isLink,
  listFiles,
  placeConfigFile,
  publishTree,
  readTree,
};
