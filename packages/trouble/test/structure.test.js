'use strict';

/**
 * Structure tests for the shipped /trouble skill. Ported from the Python
 * tests/test_skill_structure.py: frontmatter, `order` ids defined once, the
 * verdict block, and the four roles. The marketplace catalogs it also checked
 * are generated for the whole bundle and tested at the repository root.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const voices = require('../skill/tool/voices');

const ROOT = path.resolve(__dirname, '..');
const SKILL_MD = path.join(ROOT, 'skill', 'SKILL.md');
const TEXT = fs.readFileSync(SKILL_MD, 'utf8');

function split(text) {
  assert.ok(text.startsWith('---\n'), 'SKILL.md must start with YAML frontmatter ---');
  const end = text.indexOf('\n---\n', 4);
  assert.notEqual(end, -1, 'SKILL.md frontmatter is not closed');
  const front = text.slice(4, end);
  const body = text.slice(end + 5);
  assert.ok(front.trim() && body.trim());
  return { front, body };
}

const { front, body } = split(TEXT);

/** Top-level YAML keys of the body, in order. */
function topKeys(text) {
  return [...text.matchAll(/^([A-Za-z_][\w-]*):/gm)].map((m) => m[1]);
}

test('frontmatter names the skill trouble and the slash command', () => {
  assert.match(front, /^name:\s*trouble\s*$/m);
  assert.ok(front.includes('/trouble'));
  assert.match(front, /^license: GPL-3\.0-or-later$/m);
  assert.ok(front.includes('four roles'), 'the description names the roles generically');
});

test('the body is the YAML protocol, within its token budget', () => {
  assert.ok(TEXT.length <= 12000, `protocol grew to ${TEXT.length} characters`);
  assert.equal(body.includes('\n## '), false, 'body must stay YAML, not markdown sections');
  assert.ok(body.includes('announce: "Using the four-minds debug protocol"'));
  assert.ok(body.includes('order: [announce, mode, exit, inputs, 0, 1, 2, 3, 4, 5, 6, gate, 7, verdict, score]'));
  assert.ok(body.includes('name: Bayesian evaluation'));
  assert.ok(body.includes('P(H_i|E)'));
  assert.ok(body.includes('name: Unanimous agreement gate'));
  assert.ok(body.includes('each: ["yes|no", N/10, one line why]'));
  assert.ok(body.includes('TROUBLE_VERDICT_BEGIN'));
  assert.ok(body.includes('TROUBLE_VERDICT_END'));
});

test('every id in order is defined exactly once', () => {
  const order = /^order: \[(.*)\]$/m.exec(body)[1].split(',').map((s) => s.trim());
  const keys = topKeys(body);
  const phases = [...body.matchAll(/^ {2}- id: (\S+)$/gm)].map((m) => m[1]);
  for (const id of order) {
    const count = keys.filter((k) => k === id).length + phases.filter((p) => p === id).length;
    assert.equal(count, 1, `order id ${id} is defined ${count} times`);
  }
  const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
  assert.deepEqual(dupes, [], `top-level keys defined twice: ${dupes.join(', ')}`);
});

test('four roles, by id, with the default names; no real people or franchises', () => {
  const block = body.slice(body.indexOf('\nvoices:\n'), body.indexOf('\nscore:'));
  const defaults = voices.defaults();
  for (const id of voices.IDS) {
    const line = new RegExp(`^ {2}${id}: \\{who: ([^,]+), does: \\[`, 'm').exec(block);
    assert.ok(line, `voices must define ${id}`);
    assert.equal(line[1], defaults[id].who, `${id} default who: matches voices.default.yaml`);
  }
  assert.match(body, /^ {2}ids: \[keeper, detective, maintainer, physicist\]$/m);
  // Spelled in parts so this file does not itself carry the names it forbids.
  const forbidden = [['Sher', 'lock'], ['Tor', 'valds'], ['Li', 'nus'], ['Brian ', 'Cox'], ['Star ', 'Trek'], ['Da', 'ta,'], [' da', 'ta:'], [' sher', 'lock:'], [' li', 'nus:'], [' co', 'x:']].map((p) => p.join(''));
  for (const gone of forbidden) {
    assert.equal(TEXT.includes(gone), false, `SKILL.md still names ${gone.trim()}`);
  }
  // The cross-exams still address all four roles in the phases that had them.
  for (const id of voices.IDS) assert.ok((body.match(new RegExp(`^ +${id}:`, 'gm')) || []).length >= 5, `${id} is used throughout the phases`);
});

test('the untooled mode the chat pack ships is intact', () => {
  assert.match(body, /^ {2}untooled:\n {4}from: prompt text only/m);
  assert.match(body, /^ {4}skip: \[0, 1\]$/m);
  assert.match(body, /^ {4}cap: 6$/m);
  assert.match(body, /^ {4}INCIDENT_RESOLVED: "no"$/m);
});

test('no tracked text names a home directory on the author machine', () => {
  const forbidden = ['/', 'home', '/', 'chuck'].join('');
  for (const rel of ['skill/SKILL.md', 'skill/voices.default.yaml', 'README.md']) {
    assert.equal(fs.readFileSync(path.join(ROOT, rel), 'utf8').includes(forbidden), false, rel);
  }
});
