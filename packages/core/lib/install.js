'use strict';

/**
 * Install one skill into a set of harnesses, and report where it is installed.
 *
 *   installSkill({ name, source, harnesses, homes, renderFor, sourceFor, log })
 *
 * `source` is the skill directory (or a Map of rel -> { text, exec }).
 * `sourceFor(id)` may return a different tree for one harness (ceci's Hermes
 * render renames tool/ and playbooks/). `renderFor(id)` may return a function
 * that rewrites the staged SKILL.md. Harnesses that share a directory (Codex
 * and Goose both read ~/.agents/skills) are written once.
 */

const fs = require('fs');
const path = require('path');
const harness = require('./harness');
const { publishTree } = require('./fsx');

function installSkill({ name, source, harnesses, homes, renderFor = () => undefined, sourceFor = () => source, log = () => {} }) {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error(`bad skill name ${name}`);
  const written = [];
  for (const id of harnesses) {
    for (const dest of harness.skillDests(id, homes, name)) {
      const same = written.find((done) => done.dest === dest);
      if (same) {
        log(`    = ${harness.byId(id).label}: ${dest} (shared with ${harness.byId(same.id).label})`);
        written.push({ id, dest, shared: true });
        continue;
      }
      publishTree(sourceFor(id), dest, { renderSkill: renderFor(id) });
      log(`    + ${harness.byId(id).label}: ${dest}`);
      written.push({ id, dest, shared: false });
    }
  }
  return written;
}

/** [label, SKILL.md path, installed?] for every harness. */
function status(name, homes) {
  return harness.HARNESSES.map((h) => {
    const file = path.join(harness.skillDests(h.id, homes, name)[0], 'SKILL.md');
    let installed = false;
    try {
      installed = fs.lstatSync(file).isFile();
    } catch {
      installed = false;
    }
    return { id: h.id, label: h.label, file, installed };
  });
}

function formatStatus(name, rows) {
  const lines = [`${name}:`];
  for (const row of rows) {
    lines.push(`  [${row.installed ? 'x' : ' '}] ${row.label.padEnd(28)} ${row.installed ? row.file : 'not installed'}`);
  }
  return lines.join('\n');
}

module.exports = { formatStatus, installSkill, status };
