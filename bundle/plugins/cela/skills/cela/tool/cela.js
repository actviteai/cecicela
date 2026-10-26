#!/usr/bin/env node
'use strict';

/**
 * cela engine. The model proposes, this tool decides: it runs the checks,
 * computes the oracles, and names the terminal state. Zero dependencies so
 * it runs from any installed skill tree with plain `node`.
 *
 * Task files, relative to the repository root. The model never reads them;
 * only the tool does, so they can be rich at no token cost:
 *   .cela/oracles.json       what "done" means: risk, task, requirements, files, commands (start/plan/req)
 *   .cela/state.jsonl        append-only log: start, plan, req, cover, check, gate, claim, note, stop
 *   .cela/rounds/<n>.patch   the exact diff each check round measured
 *   .cela/archive/<time>/    the previous task's files, moved there by the next start
 *
 * Memory lives under $CELA_HOME (default ~/.cela), one record per line.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const RISKS = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'];
const DEPTHS = ['lean', 'full'];
const REQUIRED = {
  LOW: ['runtime', 'repo', 'coverage'],
  MODERATE: ['runtime', 'repo', 'coverage'],
  HIGH: ['runtime', 'repo', 'coverage', 'repro'],
  CRITICAL: ['runtime', 'repo', 'coverage', 'repro', 'external'],
};
const WEIGHTS = { runtime: 30, repo: 20, coverage: 20, repro: 10, external: 10, claims: 10 };
const SCORE = { pass: 10, partial: 5, fail: 0 };
const TERMINAL = ['COMPLETE', 'STALLED', 'BLOCKED', 'MISSING_TEST', 'UNCLEAR_TASK'];
/**
 * Every score runs 0..10 and both ends are named, so no number is read without
 * its meaning: 0 is alpha (nothing proven), 10 is omega (nothing left to prove).
 */
const SCALES = {
  oracle: { 10: 'pass: the evidence is complete', 5: 'partial: it ran, but the evidence is incomplete', 0: 'fail' },
  // Q bands, highest first: [floor, name, meaning]. Q informs; the gate decides.
  Q: [
    [10, 'omega', 'every measured oracle passed'],
    [8, 'strong', 'passes, with light evidence missing'],
    [5, 'mixed', 'a failing oracle, or several partial ones'],
    [0.1, 'weak', 'the main oracles failed'],
    [0, 'alpha', 'no measured oracle passed'],
  ],
  confidence: { 0: 'a guess', 3: 'one unverified source', 5: 'observed once', 8: 'observed and reproduced', 10: 'primary source read, and reproduced' },
};
const MAX_ROUNDS = 3;
const TASK_CAP = 500;
const REQ_CAP = 200;
const PATCH_CAP = 512 * 1024;
const NOTE_TYPES = ['assumption', 'decision', 'risk', 'blocker', 'question'];
// What happened to the work after the gate, set by the reviewer or CI, never by
// the agent: the gate's verdict is the prediction, the outcome is the truth.
const OUTCOMES = {
  accepted: 'shipped as the gate measured it',
  revised: 'shipped after changes the gate did not ask for',
  rejected: 'discarded',
};
const GENERATED = /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|poetry\.lock|go\.sum)$|(^|\/)(dist|build|coverage)\//;
const TEST_FILE = /(^|\/)(test|tests|__tests__|spec)\/|\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)test_[^/]*\.py$|_test\.(py|go)$/;
const FIXTURE = /(^|\/)(fixtures?|__fixtures__|__snapshots__|testdata)\//;
const isTest = (f) => TEST_FILE.test(f) && !FIXTURE.test(f);
// Flags that never take a value, so `claim --external "text"` keeps its text.
const BOOLEAN_FLAGS = ['before', 'json', 'external', 'verified', 'off-path', 'no-defect', 'keep'];
const MEMORY_CAPS = { fact: 240, evidence: 160, global: 80, project: 40, search: 12 };
const MEMORY_CLASSES = ['USER_SPECIFIED', 'OBSERVED', 'VERIFIED_EXTERNAL', 'INFERRED'];
const MEMORY_STATUS = ['ACTIVE', 'STALE', 'SUPERSEDED', 'INVALID'];
const SECRET = /(AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY|gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}|xox[abpr]-[A-Za-z0-9-]{10,}|\b(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*\S{6,})/i;
const EXIT = { COMPLETE: 0, CONTINUE: 3 };

class UsageError extends Error {}

// ---------------------------------------------------------------- utilities

function run(command, cwd, timeoutMs = 10 * 60 * 1000) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const began = Date.now();
  const r = spawnSync(command, { cwd, shell: true, encoding: 'utf8', timeout: timeoutMs, env, maxBuffer: 64 * 1024 * 1024 });
  const output = `${r.stdout || ''}\n${r.stderr || ''}`;
  return { code: r.status === null ? 124 : r.status, output, ms: Date.now() - began };
}

function git(root, args) {
  // quotePath=false: non-ASCII names come back as-is instead of "caf\303\251.js".
  const r = spawnSync('git', ['-c', 'core.quotePath=false', ...args], { cwd: root, encoding: 'utf8' });
  return r.status === 0 ? r.stdout : null;
}

/** Like git(), but keeps stdout whatever the exit status: `diff --no-index` exits 1 on differences. */
function gitAny(root, args) {
  const r = spawnSync('git', ['-c', 'core.quotePath=false', ...args], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return r.error ? null : r.stdout || '';
}

function repoRoot(cwd) {
  const top = git(cwd, ['rev-parse', '--show-toplevel']);
  return top ? top.trim() : cwd;
}

function taskPaths(root) {
  const dir = path.join(root, '.cela');
  return { dir, oracles: path.join(dir, 'oracles.json'), log: path.join(dir, 'state.jsonl'), rounds: path.join(dir, 'rounds'), archive: path.join(dir, 'archive') };
}

function writeSpec(root, spec) {
  fs.mkdirSync(taskPaths(root).dir, { recursive: true });
  fs.writeFileSync(taskPaths(root).oracles, `${JSON.stringify(spec, null, 2)}\n`);
}

function samePath(a, b) {
  const real = (p) => {
    try {
      return fs.realpathSync.native(p);
    } catch {
      return path.resolve(p);
    }
  };
  const [x, y] = [real(a), real(b)];
  return process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y;
}

// Commands that keep their state in <repo>/.cela/.
const TASK_COMMANDS = new Set(['start', 'plan', 'req', 'cover', 'check', 'gate', 'claim', 'note', 'state', 'outcome']);

/**
 * Run from the home directory, <repo>/.cela/ would be $CELA_HOME itself
 * (~/.cela), where memory and the installed skill live. Never mix the two.
 */
function assertTaskRoot(root, env) {
  if (samePath(taskPaths(root).dir, memoryHome(env))) {
    throw new UsageError(`${root} is not a project: its .cela/ is the cela home ($CELA_HOME). Run this from the repository you are changing.`);
  }
}

function readJson(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new UsageError(`${file} is not valid JSON; run \`start\` again to rewrite it`);
  }
}

/** A torn line from an interrupted write is skipped, never fatal. */
function readLog(root) {
  return readLogFile(taskPaths(root).log);
}

function readLogFile(log) {
  if (!fs.existsSync(log)) return [];
  const events = [];
  for (const line of fs.readFileSync(log, 'utf8').split('\n')) {
    if (!line) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      // skip
    }
  }
  return events;
}

function append(root, event) {
  const { dir, log } = taskPaths(root);
  fs.mkdirSync(dir, { recursive: true });
  const line = { t: new Date().toISOString(), ...event };
  fs.appendFileSync(log, `${JSON.stringify(line)}\n`);
  return line;
}

/** Every task record in a repository: the current one, then the archive, oldest first. */
function taskDirs(root) {
  const { dir, archive } = taskPaths(root);
  const dirs = [];
  if (fs.existsSync(archive)) {
    for (const stamp of fs.readdirSync(archive).sort()) dirs.push(path.join(archive, stamp));
  }
  dirs.push(dir);
  return dirs.filter((d) => fs.existsSync(path.join(d, 'oracles.json')));
}

function list(value) {
  if (value === undefined || value === null || value === true) return [];
  return String(value).split(',').map((s) => s.trim()).filter(Boolean);
}

/** Planned paths are compared with git's names: forward slashes, relative to the root. */
function normalizePath(p) {
  const n = path.posix.normalize(String(p).replace(/\\/g, '/')).replace(/^\.\//, '').replace(/\/$/, '');
  return n === '.' ? '' : n;
}

function specHash(spec) {
  const key = JSON.stringify([spec.risk, spec.run, spec.repro, spec.defect, [...spec.files].sort(), (spec.reqs || []).map((r) => `${r.id} ${r.text}`)]);
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 12);
}

function parseFlags(argv, repeatable = []) {
  const flags = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      flags._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    let value = true;
    if (!BOOLEAN_FLAGS.includes(key) && next !== undefined && (repeatable.includes(key) || !next.startsWith('--'))) {
      value = next;
      i += 1;
    }
    if (repeatable.includes(key)) (flags[key] = flags[key] || []).push(value);
    else flags[key] = value;
  }
  return flags;
}

function firstFailureLine(output) {
  const patterns = [
    /^\s*✖\s+(.+?)(?:\s+\([\d.]+m?s\))?\s*$/m, // node --test
    /^\s*not ok \d+ - (.+)$/m, // TAP
    /^FAILED\s+(\S+)/m, // pytest
    /^\s*●\s+(.+)$/m, // jest
    /^--- FAIL: (\S+)/m, // go test
    /^(\w*Error\b.*)$/m,
  ];
  for (const re of patterns) {
    const m = re.exec(output);
    if (m) return m[1].trim().slice(0, 160);
  }
  return null;
}

// ---------------------------------------------------------------- oracles

function changedFiles(root, base) {
  if (!base) return null;
  const diff = git(root, ['diff', '--name-only', base]);
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard']);
  if (diff === null) return null;
  return [...new Set(`${diff}\n${untracked || ''}`.split('\n').filter(Boolean))]
    .filter((f) => !f.startsWith('.cela/'))
    .sort();
}

function fingerprint(root, base) {
  const files = changedFiles(root, base) || [];
  const hash = crypto.createHash('sha256');
  for (const f of files) {
    hash.update(f);
    try {
      hash.update(fs.readFileSync(path.join(root, f)));
    } catch {
      hash.update('<deleted>');
    }
  }
  return hash.digest('hex').slice(0, 16);
}

/**
 * The change itself, for the record: `git diff <base>` plus each untracked
 * file as a diff against nothing, written to .cela/rounds/<round>.patch. It is
 * never printed, so it costs the model nothing, and a reviewer or a training
 * set still gets the exact patch each verdict was about.
 */
function recordPatch(root, base, changed, round) {
  if (!base || !changed) return null;
  const parts = [gitAny(root, ['diff', base, '--', '.', ':(exclude).cela']) || ''];
  const tracked = new Set((git(root, ['ls-files']) || '').split('\n'));
  for (const f of changed) {
    if (!tracked.has(f)) parts.push(gitAny(root, ['diff', '--no-index', '--', '/dev/null', f]) || '');
  }
  let text = parts.filter(Boolean).join('');
  if (text.length > PATCH_CAP) text = `${text.slice(0, PATCH_CAP)}\n... truncated at ${PATCH_CAP} bytes\n`;
  const { rounds } = taskPaths(root);
  fs.mkdirSync(rounds, { recursive: true });
  fs.writeFileSync(path.join(rounds, `${round}.patch`), text);
  const stat = { patch: `rounds/${round}.patch`, files: changed.length, insertions: 0, deletions: 0 };
  for (const line of text.split('\n')) {
    if (/^\+(?!\+\+ )/.test(line)) stat.insertions += 1;
    else if (/^-(?!-- )/.test(line)) stat.deletions += 1;
  }
  return stat;
}

function allTestFiles(root) {
  const tracked = git(root, ['ls-files']) || '';
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard']) || '';
  return `${tracked}\n${untracked}`.split('\n').filter((f) => f && isTest(f) && !f.startsWith('.cela/'));
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const isSource = (f) => !isTest(f) && /\.[cm]?[jt]sx?$|\.py$/.test(f);

/**
 * Every test file that is part of the change: it changed, or it imports a
 * changed source file by its path (JS/TS relative import, or a Python dotted
 * module). Whether the required command executes that test is not observed;
 * the import is the proxy. Map of test file -> how it touches the change.
 */
function touchingTests(root, changed) {
  const via = new Map();
  for (const t of changed.filter(isTest)) via.set(t, `changed test ${t}`);
  const sources = changed.filter(isSource);
  if (!sources.length) return via;
  for (const t of allTestFiles(root)) {
    if (via.has(t)) continue;
    let text;
    try {
      text = fs.readFileSync(path.join(root, t), 'utf8');
    } catch {
      continue;
    }
    for (const src of sources) {
      const noExt = src.replace(/\.[^./]+$/, '');
      let rel = path.posix.relative(path.posix.dirname(t), noExt);
      if (!rel.startsWith('.')) rel = `./${rel}`;
      const js = new RegExp(`(require\\(|import\\b|from\\b)[^\\n]*['"\`]${escapeRe(rel)}(\\.[cm]?[jt]sx?)?(/index(\\.[cm]?[jt]sx?)?)?['"\`]`);
      const dotted = noExt.replace(/\//g, '.').replace(/^src\./, '');
      const py = src.endsWith('.py') && new RegExp(`^\\s*(from\\s+(\\w+\\.)*${escapeRe(dotted.split('.').pop())}\\s+import|import\\s+[\\w.]*${escapeRe(dotted)}\\b|from\\s+[\\w.]*${escapeRe(dotted)}\\s+import)`, 'm');
      if (js.test(text) || (py && py.test(text))) {
        via.set(t, `${t} imports ${src}`);
        break;
      }
    }
  }
  return via;
}

function touchesChange(changed, touching) {
  if (!touching) return { touches: false, via: 'no git base' };
  const first = touching.values().next().value;
  if (first) return { touches: true, via: first };
  return { touches: false, via: changed.some(isSource) ? 'no test file imports a changed source file' : 'no changed source file a test could import' };
}

function runtimeOracle(root, spec, changed, touching) {
  if (!spec.run.length) return { observed: null, detail: 'no required command; pass --run to start', commands: [] };
  const results = spec.run.map((cmd) => ({ cmd, ...run(cmd, root) }));
  const commands = results.map((r) => ({ cmd: r.cmd, code: r.code, ms: r.ms }));
  const failed = results.find((r) => r.code !== 0);
  if (failed) {
    const line = firstFailureLine(failed.output);
    return {
      observed: 'fail',
      detail: `${failed.cmd} exited ${failed.code}${line ? `: ${line}` : ''}`,
      oracle_id: `${failed.cmd} :: ${line || `exit ${failed.code}`}`,
      tail: failed.output.trim().split('\n').slice(-15).join('\n'),
      commands,
    };
  }
  const touch = touchesChange(changed || [], touching);
  return touch.touches
    ? { observed: 'pass', detail: `${results.length} command(s) exit 0; ${touch.via}`, commands }
    : { observed: 'partial', detail: `${results.length} command(s) exit 0, but ${touch.via}`, commands };
}

/**
 * The gauntlet the tool can enforce: every requirement clause the task listed
 * must be covered by a test that exists, names it, and touches the change.
 * Value is covered/total on the 0..10 scale, so 10 means every clause has a test.
 */
function coverageOracle(root, spec, log, touching) {
  const reqs = spec.reqs || [];
  if (!reqs.length) return { observed: null, detail: 'no requirements listed (start --req, or req "<clause>")', unjustified: true };
  const covers = new Map();
  for (const e of log) if (e.kind === 'cover') covers.set(e.req, e);
  const gaps = [];
  let covered = 0;
  for (const r of reqs) {
    const c = covers.get(r.id);
    if (!c) {
      gaps.push(`${r.id} uncovered`);
      continue;
    }
    let text = null;
    try {
      text = fs.readFileSync(path.join(root, c.file), 'utf8');
    } catch {
      // missing file: reported below
    }
    if (text === null || !text.includes(c.text)) gaps.push(`${r.id}: "${c.text}" is not in ${c.file}`);
    else if (!touching || !touching.has(c.file)) gaps.push(`${r.id}: ${c.file} neither changed nor imports a changed file`);
    else covered += 1;
  }
  const value = Math.round((10 * covered) / reqs.length);
  if (!gaps.length) return { observed: 'pass', value, detail: `${covered}/${reqs.length} requirements covered by tests that touch the change` };
  const shown = gaps.slice(0, 3);
  if (gaps.length > 3) shown.push(`${gaps.length - 3} more`);
  const detail = `${covered}/${reqs.length} covered; ${shown.join('; ')}`;
  return covered
    ? { observed: 'partial', value, detail }
    : { observed: 'fail', value, detail, oracle_id: `coverage :: ${gaps.join('; ')}` };
}

function repoOracle(spec, changed) {
  if (!changed) return { observed: null, detail: 'not a git repository or no base commit' };
  const planned = new Set(spec.files);
  const extras = changed.filter((f) => !planned.has(f));
  const missing = spec.files.filter((f) => !changed.includes(f));
  if (!extras.length && !missing.length) return { observed: 'pass', detail: `diff matches the ${planned.size} planned file(s)` };
  const unplanned = extras.filter((f) => !GENERATED.test(f));
  if (!unplanned.length && !missing.length) return { observed: 'partial', detail: `only generated extras: ${extras.join(', ')}` };
  const gap = [unplanned.length && `unplanned: ${unplanned.join(', ')}`, missing.length && `planned but unchanged: ${missing.join(', ')}`].filter(Boolean).join('; ');
  return { observed: 'fail', detail: `${gap} (amend with plan --add/--drop and --why)`, oracle_id: `repo :: ${gap}` };
}

function reproOracle(root, spec, log) {
  if (!spec.repro) {
    return spec.defect === false
      ? { observed: null, detail: 'no defect in scope (start --no-defect)' }
      : { observed: null, detail: 'no repro command', unjustified: true };
  }
  const before = log.filter((e) => e.kind === 'repro-before').pop();
  const after = run(spec.repro, root);
  if (after.code !== 0) {
    const line = firstFailureLine(after.output);
    return { observed: 'fail', detail: `repro still fails${line ? `: ${line}` : ''}`, oracle_id: `${spec.repro} :: ${line || `exit ${after.code}`}` };
  }
  if (!before) return { observed: 'partial', detail: 'passes now; run check --before first to prove it failed' };
  if (before.sourceChanged) return { observed: 'partial', detail: 'check --before ran after source files were already edited' };
  if (before.code === 0) return { observed: 'partial', detail: 'repro passed before the fix, so it did not reproduce the defect' };
  return { observed: 'pass', detail: 'failed before the fix, passes after' };
}

function claimOracles(log) {
  const claims = log.filter((e) => e.kind === 'claim');
  const external = claims.filter((c) => c.external);
  let ext;
  if (!external.length) ext = { observed: null, detail: 'no external claim recorded' };
  else {
    const unverified = external.filter((c) => !c.verified);
    if (!unverified.length) ext = { observed: 'pass', detail: `${external.length} external claim(s) verified` };
    else if (unverified.every((c) => c.offPath)) ext = { observed: 'partial', detail: `${unverified.length} unverified, all off the changed path` };
    else ext = { observed: 'fail', detail: `unverified on the changed path: ${unverified.filter((c) => !c.offPath).map((c) => c.text).join('; ')}`, oracle_id: `external :: ${unverified.map((c) => c.text).join('; ')}` };
  }
  const verified = claims.filter((c) => c.verified).length;
  const claimsOracle = claims.length
    ? { value: Math.round((10 * verified) / claims.length), detail: `${verified}/${claims.length} material claims verified` }
    : { observed: null, detail: 'no claims recorded' };
  return { external: ext, claims: claimsOracle };
}

function numeric(o) {
  if (typeof o.value === 'number') return o.value;
  return o.observed ? SCORE[o.observed] : null;
}

function quality(oracles) {
  let num = 0;
  let den = 0;
  for (const [name, o] of Object.entries(oracles)) {
    const v = numeric(o);
    if (v === null) continue;
    num += WEIGHTS[name] * v;
    den += WEIGHTS[name];
  }
  return den ? Math.round((num / den) * 10) / 10 : 'UNMEASURED';
}

function qBand(Q) {
  if (typeof Q !== 'number') return 'unmeasured';
  return SCALES.Q.find(([floor]) => Q >= floor)[1];
}

// ---------------------------------------------------------------- commands

function requireSpec(root) {
  const spec = readJson(taskPaths(root).oracles);
  if (!spec) throw new UsageError('no .cela/oracles.json; run `start` first');
  return spec;
}

/**
 * Memory the task is likely to need, found from its own words: planned file
 * names (strong signal) and words of the task and its requirements. Printed by
 * start so recall costs no extra turn; `memory search` still finds more.
 */
const STOP_WORDS = new Set(['about', 'after', 'before', 'should', 'there', 'their', 'these', 'those', 'which', 'while', 'where', 'would', 'could', 'return', 'returns', 'input', 'output', 'value', 'values', 'field', 'fields', 'string', 'strings', 'array', 'function', 'method', 'change', 'changes', 'update', 'updates', 'using', 'without', 'every', 'other', 'tests', 'files', 'error', 'errors', 'empty', 'returned', 'instead', 'always', 'never', 'exactly', 'within', 'between', 'through']);

function recall(home, root, spec) {
  const names = spec.files.map((p) => path.posix.basename(p).replace(/\.[^.]*$/, '').toLowerCase()).filter((b) => b.length >= 3 && !/^(index|test|spec|main|utils?|lib)$/.test(b));
  const words = [...new Set(norm(`${spec.task || ''} ${(spec.reqs || []).map((r) => r.text).join(' ')}`).split(/[^a-z0-9_-]+/).filter((w) => w.length >= 5 && !STOP_WORDS.has(w)))];
  if (!names.length && !words.length) return [];
  return ['project', 'global']
    .flatMap((s) => loadMemory(memoryFile(home, s, root)))
    .filter((r) => r.status === 'ACTIVE')
    .map((r) => {
      const hay = norm(`${r.fact} ${r.evidence} ${(r.tags || []).join(' ')}`);
      return { r, score: names.filter((b) => hay.includes(b)).length * 2 + words.filter((w) => hay.includes(w)).length };
    })
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((x) => x.r);
}

function newTaskId() {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `T-${day}-${crypto.randomBytes(2).toString('hex')}`;
}

function cmdStart(root, argv, out, env) {
  const f = parseFlags(argv, ['run', 'req']);
  const risk = String(f.risk || '').toUpperCase();
  if (!RISKS.includes(risk)) throw new UsageError(`start needs --risk ${RISKS.join('|')}`);
  const depthFile = path.join(taskPaths(root).dir, 'depth');
  const preset = fs.existsSync(depthFile) ? fs.readFileSync(depthFile, 'utf8').trim() : '';
  const depth = f.depth ? String(f.depth) : preset || 'lean';
  if (!DEPTHS.includes(depth)) {
    throw new UsageError(f.depth ? `--depth must be ${DEPTHS.join('|')}` : `.cela/depth says "${depth}"; it must be ${DEPTHS.join(' or ')}`);
  }
  const { dir, oracles, log } = taskPaths(root);
  // The repo oracle compares the diff with a base commit; without one no task
  // can reach COMPLETE, so refuse before writing anything.
  const head = git(root, ['rev-parse', '--verify', '-q', 'HEAD']);
  if (!head) {
    throw new UsageError(git(root, ['rev-parse', '--is-inside-work-tree'])
      ? `${root} has no commits yet. Commit once so cela has a base to compare the change against.`
      : `${root} is not inside a git repository. Run start from the root of the repository you are changing; cela compares the change against its last commit.`);
  }
  const existing = fs.existsSync(oracles) ? readJson(oracles) : null;
  const keep = Boolean(f.keep && existing);
  const task = typeof f.task === 'string' ? f.task.trim().slice(0, TASK_CAP) : keep && existing.task ? existing.task : '';
  const given = (f.req || []).filter((r) => typeof r === 'string' && r.trim());
  const reqs = given.length || !keep ? given.map((text, i) => ({ id: `R${i + 1}`, text: text.trim().slice(0, REQ_CAP) })) : existing.reqs || [];
  if (SECRET.test(task) || reqs.some((r) => SECRET.test(r.text))) throw new UsageError('refusing to log something that looks like a secret');
  // A new task gets a fresh log and base; --keep re-defines the current task instead.
  // The previous task moves whole (log, plan, patches) so it stays one record.
  if (existing && !f.keep && fs.existsSync(log)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const into = path.join(taskPaths(root).archive, stamp);
    fs.mkdirSync(into, { recursive: true });
    for (const name of ['state.jsonl', 'oracles.json', 'rounds']) {
      if (fs.existsSync(path.join(dir, name))) fs.renameSync(path.join(dir, name), path.join(into, name));
    }
    out(`previous task archived to .cela/archive/${stamp}/ (pass --keep to amend the current task instead)`);
  }
  const spec = {
    version: 2,
    id: keep && existing.id ? existing.id : newTaskId(),
    risk,
    depth,
    task,
    reqs,
    base: keep && existing.base ? existing.base : head.trim(),
    files: list(f.files).map(normalizePath).filter(Boolean),
    run: (f.run || []).filter((r) => r !== true).map(String),
    repro: typeof f.repro === 'string' ? f.repro : null,
    defect: f['no-defect'] ? false : Boolean(f.repro) || null,
  };
  writeSpec(root, spec);
  append(root, { kind: 'start', ...spec });
  out(`started ${spec.id}: risk ${risk}, depth ${depth}, required oracles ${REQUIRED[risk].join(', ')}`);
  out(`planned files: ${spec.files.join(', ') || '(none yet)'}`);
  out(`required commands: ${spec.run.join(' && ') || '(none: gate will say MISSING_TEST)'}`);
  out(reqs.length
    ? `requirements: ${reqs.length} (${reqs.map((r) => r.id).join(' ')}); after writing the tests, cover each: \`cover R1 <test-file> "<test name>"\``
    : 'warning: no requirements listed; the gate needs at least one. Add each clause of the request: `req "<clause>"`');
  if (spec.repro) out(`repro: ${spec.repro} (run \`check --before\` now, before fixing)`);
  if (REQUIRED[risk].includes('repro') && !spec.repro && spec.defect !== false) {
    out('warning: this risk requires repro; pass --repro <command>, or --no-defect when nothing is broken');
  }
  const hits = recall(memoryHome(env), root, spec);
  if (hits.length) {
    out(`memory (${hits.length} matching, \`memory search <terms>\` for more):`);
    for (const r of hits) out(`  ${r.id} [${r.class}] ${r.fact} — ${r.evidence}`);
  }
  return 0;
}

function cmdReq(root, argv, out) {
  const spec = requireSpec(root);
  const text = argv.join(' ').trim().slice(0, REQ_CAP);
  if (!text) throw new UsageError('req needs text: req "<one testable clause of the request>"');
  if (SECRET.test(text)) throw new UsageError('refusing to log something that looks like a secret');
  spec.reqs = spec.reqs || [];
  const id = `R${spec.reqs.length + 1}`;
  spec.reqs.push({ id, text });
  writeSpec(root, spec);
  append(root, { kind: 'req', id, text });
  out(`${id} added (${spec.reqs.length} requirement(s)); cover it with \`cover ${id} <test-file> "<test name>"\``);
  return 0;
}

/** A cover is checked now, so a wrong one costs no check round; check verifies it again. */
function cmdCover(root, argv, out) {
  const spec = requireSpec(root);
  const [id, fileArg, ...rest] = argv;
  const text = rest.join(' ').trim();
  if (!id || !fileArg || !text) throw new UsageError('cover needs: cover <R-id> <test-file> "<text that names the test>"');
  const req = (spec.reqs || []).find((r) => r.id === String(id).toUpperCase());
  if (!req) throw new UsageError(`no requirement ${id}; listed: ${(spec.reqs || []).map((r) => r.id).join(', ') || 'none'}`);
  const file = normalizePath(fileArg);
  if (!isTest(file)) throw new UsageError(`${file} is not a test file`);
  let content;
  try {
    content = fs.readFileSync(path.join(root, file), 'utf8');
  } catch {
    throw new UsageError(`${file} does not exist; write the test first`);
  }
  if (!content.includes(text)) throw new UsageError(`"${text}" is not in ${file}; name text that is in the test`);
  append(root, { kind: 'cover', req: req.id, file, text: text.slice(0, REQ_CAP) });
  out(`${req.id} covered by ${file}`);
  return 0;
}

function cmdPlan(root, argv, out) {
  const f = parseFlags(argv);
  const spec = requireSpec(root);
  const why = typeof f.why === 'string' ? f.why : '';
  if (!why) throw new UsageError('plan needs --why "<reason>"; plan changes are logged');
  const add = list(f.add).map(normalizePath).filter(Boolean);
  const drop = list(f.drop).map(normalizePath).filter(Boolean);
  spec.files = [...new Set([...spec.files.filter((x) => !drop.includes(x)), ...add])];
  writeSpec(root, spec);
  append(root, { kind: 'plan', add, drop, why });
  out(`planned files: ${spec.files.join(', ')}`);
  return 0;
}

function renderOracles(oracles, required, out) {
  for (const name of Object.keys(WEIGHTS)) {
    const o = oracles[name];
    const v = numeric(o);
    const mark = o.observed || (typeof o.value === 'number' ? `${o.value}/10` : 'n/a');
    const req = required.includes(name) ? ' (required)' : '';
    out(`  ${name.padEnd(8)} ${String(mark).padEnd(8)} ${v === null ? '' : `[${v}] `}${o.detail}${req}`);
  }
}

function cmdCheck(root, argv, out) {
  const f = parseFlags(argv);
  const spec = requireSpec(root);
  const log = readLog(root);
  if (f.before) {
    if (!spec.repro) throw new UsageError('no repro command; pass --repro to start');
    const r = run(spec.repro, root);
    const edited = (changedFiles(root, spec.base) || []).filter((x) => !isTest(x));
    append(root, { kind: 'repro-before', code: r.code, line: firstFailureLine(r.output), sourceChanged: edited.length > 0 });
    if (edited.length) out(`warning: source already edited (${edited.join(', ')}); this does not prove the defect existed before the fix`);
    out(r.code === 0 ? 'repro PASSED before the fix: it does not reproduce the defect yet' : `repro failed as expected (exit ${r.code})`);
    return 0;
  }
  const prior = log.filter((e) => e.kind === 'check').length;
  if (prior >= MAX_ROUNDS) {
    throw new UsageError(`all ${MAX_ROUNDS} rounds are used; run \`gate\` and report its verdict`);
  }
  const began = Date.now();
  const changed = changedFiles(root, spec.base);
  const touching = changed ? touchingTests(root, changed) : null;
  const oracles = {
    runtime: runtimeOracle(root, spec, changed, touching),
    repo: repoOracle(spec, changed),
    coverage: coverageOracle(root, spec, log, touching),
    repro: reproOracle(root, spec, log),
    ...claimOracles(log),
  };
  const round = prior + 1;
  const Q = quality(oracles);
  const failures = Object.values(oracles).filter((o) => o.oracle_id).map((o) => o.oracle_id);
  const stored = Object.fromEntries(Object.entries(oracles).map(([k, o]) => [k, { observed: o.observed ?? null, value: o.value, detail: o.detail, oracle_id: o.oracle_id }]));
  const diff = recordPatch(root, spec.base, changed, round);
  append(root, { kind: 'check', round, Q, band: qBand(Q), oracles: stored, failures, changed, diff, commands: oracles.runtime.commands, ms: Date.now() - began, fingerprint: fingerprint(root, spec.base), spec: specHash(spec) });
  out(`check round ${round}: Q ${Q} (${qBand(Q)})`);
  renderOracles(oracles, REQUIRED[spec.risk], out);
  if (oracles.runtime.tail) out(`\nlast output of the failing command:\n${oracles.runtime.tail}`);
  // The verdict follows at once: a separate gate call would be one more turn for the same answer.
  const result = decide(root);
  append(root, { kind: 'gate', ...result });
  out('');
  renderGate(result, out);
  return 0;
}

/** Decide the terminal state from the log. Pure: does not run anything. */
function decide(root) {
  const spec = readJson(taskPaths(root).oracles);
  if (!spec) return { verdict: 'UNCLEAR_TASK', reasons: ['no oracles.json: the task was never started with `start`'] };
  const log = readLog(root);
  const checks = log.filter((e) => e.kind === 'check');
  const last = checks[checks.length - 1];
  const lastIndex = last ? log.lastIndexOf(last) : -1;
  const blocker = log.slice(lastIndex + 1).filter((e) => e.kind === 'note' && e.type === 'blocker').pop();
  if (blocker) return { verdict: 'BLOCKED', reasons: [blocker.text] };
  if (!spec.run.length) return { verdict: 'MISSING_TEST', reasons: ['no required command was named with --run'] };
  if (!last) return { verdict: 'CONTINUE', reasons: ['no check has run yet'], round: 0 };
  const stale = [];
  if (fingerprint(root, spec.base) !== last.fingerprint) stale.push('files changed since the last check');
  if (last.spec !== specHash(spec)) stale.push('the plan (risk, files, or commands) changed since the last check');
  if (stale.length) {
    if (last.round >= MAX_ROUNDS) {
      return { verdict: 'STALLED', reasons: [`round cap (${MAX_ROUNDS}) reached`, ...stale, 'the last measured check did not complete'], round: last.round, Q: last.Q };
    }
    return { verdict: 'CONTINUE', reasons: [...stale.map((r) => `${r}; run check again`)], round: last.round };
  }

  const required = REQUIRED[spec.risk];
  const reasons = [];
  for (const name of required) {
    const o = last.oracles[name];
    const v = numeric(o);
    if (name === 'repro' && v === null) {
      if (spec.defect !== false) reasons.push('repro required: pass --repro <command>, or start --no-defect');
      continue;
    }
    if (name === 'coverage' && v === null) {
      reasons.push('coverage required: list each clause of the request with `req "<clause>"`, then cover each with a test');
      continue;
    }
    if (name === 'external' && v === null) continue; // null only when no external claim was recorded
    else if (v === null) reasons.push(`${name} did not run: ${o.detail}`);
    else if (o.observed && o.observed !== 'pass') reasons.push(`${name} is ${o.observed}: ${o.detail}`);
  }
  for (const [name, o] of Object.entries(last.oracles)) {
    if (o.observed === 'fail' && !required.includes(name)) reasons.push(`${name} failed: ${o.detail}`);
  }
  if (!reasons.length) return { verdict: 'COMPLETE', reasons: [`all required oracles pass (${required.join(', ')}); Q ${last.Q}`], round: last.round, Q: last.Q };

  const prev = checks[checks.length - 2];
  const repeated = prev && last.failures.find((id) => prev.failures.includes(id));
  if (repeated) return { verdict: 'STALLED', reasons: [`same failure twice: ${repeated}`, ...reasons], round: last.round, Q: last.Q };
  if (last.round >= MAX_ROUNDS) {
    const unclear = !spec.files.length;
    return { verdict: unclear ? 'UNCLEAR_TASK' : 'STALLED', reasons: [`round cap (${MAX_ROUNDS}) reached`, ...reasons], round: last.round, Q: last.Q };
  }
  return { verdict: 'CONTINUE', reasons, round: last.round, Q: last.Q };
}

function renderGate(result, out) {
  out(`cela gate: ${result.verdict}`);
  for (const r of result.reasons) out(`  - ${r}`);
  if (result.verdict === 'CONTINUE') out(`rounds used: ${result.round || 0}/${MAX_ROUNDS}. Fix the first reason, then check again.`);
  else out(`Report exactly this terminal state: ${result.verdict}.`);
}

/** Re-reads the verdict `check` already printed. Runs nothing; for CI, hooks, and a second look. */
function cmdGate(root, argv, out) {
  const f = parseFlags(argv);
  const result = decide(root);
  if (fs.existsSync(taskPaths(root).oracles)) append(root, { kind: 'gate', ...result });
  if (f.json) out(JSON.stringify(result));
  else renderGate(result, out);
  return result.verdict in EXIT ? EXIT[result.verdict] : 1;
}

function cmdClaim(root, argv, out) {
  const f = parseFlags(argv);
  const text = f._.join(' ').trim();
  if (!text) throw new UsageError('claim needs text: claim "<statement>" [--external] [--source <url|path>] [--verified] [--off-path]');
  requireSpec(root);
  const event = append(root, { kind: 'claim', text, external: Boolean(f.external), source: typeof f.source === 'string' ? f.source : null, verified: Boolean(f.verified), offPath: Boolean(f['off-path']) });
  out(`claim recorded (${event.verified ? 'verified' : 'unverified'}${event.external ? ', external' : ''})`);
  return 0;
}

function cmdNote(root, argv, out) {
  const [type, ...rest] = argv;
  if (!NOTE_TYPES.includes(type)) throw new UsageError(`note needs a type: ${NOTE_TYPES.join('|')}`);
  const text = rest.join(' ').trim();
  if (!text) throw new UsageError('note needs text');
  if (SECRET.test(text)) throw new UsageError('refusing to log something that looks like a secret; record its source and identifier instead');
  append(root, { kind: 'note', type, text: text.slice(0, 400) });
  out(`${type} noted`);
  return 0;
}

/**
 * `outcome accepted|revised|rejected [--why "<text>"] [--task <id>]`: what
 * happened to the work after the gate. For the reviewer or CI, after the fact;
 * SKILL.md never mentions it, so the agent does not label its own work. The
 * label is appended to the task's own log, current or archived, and `export`
 * carries it beside the verdict.
 */
function cmdOutcome(root, argv, out) {
  const f = parseFlags(argv, []);
  const [label] = f._;
  if (!OUTCOMES[label]) throw new UsageError(`outcome needs a label: ${Object.keys(OUTCOMES).join('|')}`);
  const why = typeof f.why === 'string' ? f.why.trim().slice(0, 400) : '';
  if (SECRET.test(why)) throw new UsageError('refusing to log something that looks like a secret');
  const wanted = typeof f.task === 'string' ? f.task : null;
  const dirs = taskDirs(root);
  const dir = wanted ? dirs.find((d) => (readJson(path.join(d, 'oracles.json')) || {}).id === wanted) : dirs[dirs.length - 1];
  if (!dir) throw new UsageError(wanted ? `no task ${wanted} in this repository (current or archived)` : 'no cela task in this repository');
  const spec = readJson(path.join(dir, 'oracles.json'));
  const gate = readLogFile(path.join(dir, 'state.jsonl')).filter((e) => e.kind === 'gate').pop();
  const line = { t: new Date().toISOString(), kind: 'outcome', label, why, verdict: gate ? gate.verdict : null };
  fs.appendFileSync(path.join(dir, 'state.jsonl'), `${JSON.stringify(line)}\n`);
  out(`${spec.id || 'task'}: outcome ${label} (${OUTCOMES[label]}); gate said ${line.verdict || 'nothing'}`);
  return 0;
}

function cmdState(root, argv, out) {
  const f = parseFlags(argv);
  const spec = readJson(taskPaths(root).oracles);
  if (f.json) {
    out(JSON.stringify(stateJson(root, spec)));
    return 0;
  }
  if (!spec) {
    out('no cela task in this repository');
    return 0;
  }
  const log = readLog(root);
  const checks = log.filter((e) => e.kind === 'check');
  out(`risk ${spec.risk}, depth ${spec.depth}, rounds ${checks.length}/${MAX_ROUNDS}, required ${REQUIRED[spec.risk].join(', ')}`);
  if (spec.task) out(`task: ${spec.task}`);
  out(`planned files: ${spec.files.join(', ') || '(none)'}`);
  const reqs = spec.reqs || [];
  const covered = new Set(log.filter((e) => e.kind === 'cover').map((e) => e.req));
  out(reqs.length ? `requirements: ${reqs.map((r) => (covered.has(r.id) ? r.id : `${r.id}?`)).join(' ')} (${covered.size}/${reqs.length} covered; ? = not yet)` : 'requirements: none listed');
  const last = checks[checks.length - 1];
  if (last) {
    out(`last check: Q ${last.Q} (${qBand(last.Q)})`);
    renderOracles(last.oracles, REQUIRED[spec.risk], out);
  }
  const notes = log.filter((e) => e.kind === 'note').slice(-5);
  for (const n of notes) out(`  ${n.type}: ${n.text}`);
  const gate = decide(root);
  out(`gate now: ${gate.verdict}`);
  const outcome = log.filter((e) => e.kind === 'outcome').pop();
  if (outcome) out(`outcome: ${outcome.label}${outcome.why ? ` (${outcome.why})` : ''}`);
  return 0;
}

/**
 * `state --json`: the same facts as `state`, for programs (the NeMo Agent
 * Toolkit wrapper reads this instead of parsing prose). Read-only: unlike
 * `gate`, it does not append to the task log.
 */
function stateJson(root, spec) {
  if (!spec) return { task: false, spec: null, required: [], rounds: 0, maxRounds: MAX_ROUNDS, lastCheck: null, notes: [], gate: decide(root) };
  const log = readLog(root);
  const checks = log.filter((e) => e.kind === 'check');
  const last = checks[checks.length - 1];
  return {
    task: true,
    spec: { id: spec.id || null, risk: spec.risk, depth: spec.depth, task: spec.task || '', reqs: spec.reqs || [], base: spec.base, files: spec.files, run: spec.run, repro: spec.repro, defect: spec.defect },
    required: REQUIRED[spec.risk],
    rounds: checks.length,
    maxRounds: MAX_ROUNDS,
    covers: log.filter((e) => e.kind === 'cover').map((c) => ({ req: c.req, file: c.file, text: c.text })),
    lastCheck: last ? { round: last.round, Q: last.Q, band: qBand(last.Q), t: last.t, oracles: last.oracles, failures: last.failures, changed: last.changed, diff: last.diff || null } : null,
    notes: log.filter((e) => e.kind === 'note').slice(-5).map((n) => ({ type: n.type, text: n.text, t: n.t })),
    gate: decide(root),
    outcome: (() => {
      const o = log.filter((e) => e.kind === 'outcome').pop();
      return o ? { label: o.label, why: o.why, t: o.t } : null;
    })(),
  };
}

// ---------------------------------------------------------------- memory

function memoryHome(env) {
  return env.CELA_HOME || path.join(env.HOME || env.USERPROFILE || os.homedir(), '.cela');
}

function projectId(root) {
  const remote = (git(root, ['config', '--get', 'remote.origin.url']) || '').trim();
  const key = remote || root;
  return `${path.basename(root).replace(/[^\w.-]/g, '_')}-${crypto.createHash('sha256').update(key).digest('hex').slice(0, 8)}`;
}

function memoryFile(home, scope, root) {
  return scope === 'global' ? path.join(home, 'memory', 'records.jsonl') : path.join(home, 'projects', projectId(root), 'records.jsonl');
}

/** Latest line per id wins: the file is an append-only event log. */
function loadMemory(file) {
  if (!fs.existsSync(file)) return [];
  const byId = new Map();
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    try {
      const rec = JSON.parse(line);
      byId.set(rec.id, rec);
    } catch {
      // a torn line from an interrupted write is skipped, never fatal
    }
  }
  return [...byId.values()];
}

const norm = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * M-YYYYMMDD-xxxx, unused in either scope. Records are keyed by id (the
 * latest line per id wins), so a reused id would silently replace another
 * record. Four hex digits give 65536 ids a day; past 64 misses, widen.
 */
function newMemoryId(taken) {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  for (let attempt = 0; ; attempt += 1) {
    const id = `M-${day}-${crypto.randomBytes(attempt < 64 ? 2 : 4).toString('hex')}`;
    if (!taken.has(id)) return id;
  }
}

function cmdMemory(root, argv, out, env) {
  const [sub, ...rest] = argv;
  const f = parseFlags(rest);
  const home = memoryHome(env);
  if (sub === 'add') {
    const scope = f.scope === 'global' ? 'global' : 'project';
    const cls = String(f.class || '').toUpperCase();
    const fact = typeof f.fact === 'string' ? f.fact.trim() : '';
    const evidence = typeof f.evidence === 'string' ? f.evidence.trim() : '';
    if (!MEMORY_CLASSES.includes(cls)) throw new UsageError(`--class must be ${MEMORY_CLASSES.join('|')}`);
    if (!fact || !evidence) throw new UsageError('memory add needs --fact and --evidence');
    if (fact.length > MEMORY_CAPS.fact) throw new UsageError(`fact is ${fact.length} chars; the cap is ${MEMORY_CAPS.fact}`);
    if (evidence.length > MEMORY_CAPS.evidence) throw new UsageError(`evidence is ${evidence.length} chars; the cap is ${MEMORY_CAPS.evidence}`);
    if (SECRET.test(fact) || SECRET.test(evidence)) throw new UsageError('refusing to store something that looks like a secret; store its source and identifier instead');
    const file = memoryFile(home, scope, root);
    const active = loadMemory(file).filter((r) => r.status === 'ACTIVE');
    if (active.some((r) => norm(r.fact) === norm(fact))) throw new UsageError('an ACTIVE record already states this fact');
    const cap = scope === 'global' ? MEMORY_CAPS.global : MEMORY_CAPS.project;
    if (active.length >= cap) throw new UsageError(`MEMORY_CAP: ${active.length}/${cap} ACTIVE ${scope} records. Mark stale ones with \`memory stale <id>\` first.`);
    const rec = {
      id: newMemoryId(new Set(['project', 'global'].flatMap((s) => loadMemory(memoryFile(home, s, root)).map((r) => r.id)))),
      scope: scope === 'global' ? 'global' : `project:${projectId(root)}`,
      status: 'ACTIVE',
      class: cls,
      confidence: f.confidence !== undefined ? Math.max(0, Math.min(10, Number(f.confidence))) : null,
      verified: new Date().toISOString().slice(0, 10),
      fact,
      evidence,
      tags: list(f.tags),
      supersedes: typeof f.supersedes === 'string' ? f.supersedes : null,
      task: activeTaskId(root),
    };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${JSON.stringify(rec)}\n`);
    if (rec.supersedes) markMemory(home, root, rec.supersedes, 'SUPERSEDED', rec.id);
    out(`${rec.id} stored (${rec.scope})`);
    return 0;
  }
  if (sub === 'search') {
    const terms = f._.map(norm).filter(Boolean);
    const limit = Math.min(Number(f.limit) || MEMORY_CAPS.search, MEMORY_CAPS.search);
    const records = [...loadMemory(memoryFile(home, 'project', root)), ...loadMemory(memoryFile(home, 'global', root))]
      .filter((r) => r.status === 'ACTIVE')
      .filter((r) => terms.every((t) => norm(`${r.fact} ${r.evidence} ${(r.tags || []).join(' ')}`).includes(t)))
      .slice(0, limit);
    if (!records.length) out('no matching ACTIVE memory');
    for (const r of records) out(`${r.id} [${r.class}${r.confidence === null ? '' : ` ${r.confidence}/10`}] ${r.fact} — ${r.evidence}`);
    return 0;
  }
  if (sub === 'stale') {
    const id = f._[0];
    if (!id) throw new UsageError('memory stale <id> [--status STALE|SUPERSEDED|INVALID] [--by <id>]');
    const status = String(f.status || 'STALE').toUpperCase();
    if (!MEMORY_STATUS.includes(status) || status === 'ACTIVE') throw new UsageError('--status must be STALE, SUPERSEDED, or INVALID');
    if (!markMemory(home, root, id, status, typeof f.by === 'string' ? f.by : null)) throw new UsageError(`no memory record ${id}`);
    out(`${id} marked ${status}`);
    return 0;
  }
  if (sub === 'stats') {
    for (const scope of ['project', 'global']) {
      const all = loadMemory(memoryFile(home, scope, root));
      const active = all.filter((r) => r.status === 'ACTIVE').length;
      out(`${scope}: ${active} ACTIVE of ${all.length} (cap ${scope === 'global' ? MEMORY_CAPS.global : MEMORY_CAPS.project})`);
    }
    return 0;
  }
  if (sub === 'compact') {
    for (const scope of ['project', 'global']) {
      const file = memoryFile(home, scope, root);
      const all = loadMemory(file);
      if (!all.length) continue;
      const keep = all.filter((r) => r.status === 'ACTIVE');
      const retired = all.filter((r) => r.status !== 'ACTIVE');
      if (retired.length) {
        const archive = path.join(path.dirname(file), 'archive', `${new Date().toISOString().slice(0, 7)}.jsonl`);
        fs.mkdirSync(path.dirname(archive), { recursive: true });
        fs.appendFileSync(archive, retired.map((r) => `${JSON.stringify(r)}\n`).join(''));
      }
      fs.writeFileSync(file, keep.map((r) => `${JSON.stringify(r)}\n`).join(''));
      out(`${scope}: kept ${keep.length}, archived ${retired.length}`);
    }
    return 0;
  }
  throw new UsageError('memory add|search|stale|stats|compact');
}

/** The task a memory record was learned in, when one is active here. Provenance only. */
function activeTaskId(root) {
  try {
    const spec = readJson(taskPaths(root).oracles);
    return spec && spec.id ? spec.id : null;
  } catch {
    return null;
  }
}

function markMemory(home, root, id, status, by) {
  for (const scope of ['project', 'global']) {
    const file = memoryFile(home, scope, root);
    const rec = loadMemory(file).find((r) => r.id === id);
    if (rec) {
      fs.appendFileSync(file, `${JSON.stringify({ ...rec, status, superseded_by: by || rec.superseded_by || null })}\n`);
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------- export and hook

/**
 * One anonymized row per task, current and archived: measurements only, no
 * text, paths, or code. `verdict` is what the gate said; `outcome` is what the
 * reviewer said afterwards, so a row carries both prediction and truth.
 */
function cmdExport(root, argv, out) {
  const f = parseFlags(argv, ['repo']);
  const target = typeof f.out === 'string' ? path.resolve(f.out) : null;
  if (!target) throw new UsageError('export needs --out <file.jsonl>; it appends one anonymized row per task');
  const repos = (f.repo || [root]).map((r) => repoRoot(path.resolve(String(r))));
  let rows = 0;
  for (const repo of repos) for (const dir of taskDirs(repo)) {
    const spec = readJson(path.join(dir, 'oracles.json'));
    if (!spec) continue;
    const log = readLogFile(path.join(dir, 'state.jsonl'));
    const checks = log.filter((e) => e.kind === 'check');
    const gate = log.filter((e) => e.kind === 'gate').pop();
    const outcome = log.filter((e) => e.kind === 'outcome').pop();
    const count = (kind) => log.filter((e) => e.kind === kind).length;
    const row = {
      repo: crypto.createHash('sha256').update(repo).digest('hex').slice(0, 12),
      id: spec.id || null,
      exported: new Date().toISOString(),
      risk: spec.risk,
      depth: spec.depth,
      task_chars: (spec.task || '').length,
      reqs: (spec.reqs || []).length,
      planned_files: spec.files.length,
      commands: spec.run.length,
      repro: Boolean(spec.repro),
      rounds: checks.length,
      checks: checks.map((c) => ({
        round: c.round,
        Q: c.Q,
        band: c.band || qBand(c.Q),
        changed_files: (c.changed || []).length,
        insertions: c.diff ? c.diff.insertions : null,
        deletions: c.diff ? c.diff.deletions : null,
        ms: c.ms ?? null,
        ...Object.fromEntries(Object.entries(c.oracles).map(([k, o]) => [k, o.observed ?? (typeof o.value === 'number' ? o.value : null)])),
      })),
      covers: count('cover'),
      claims: count('claim'),
      notes: count('note'),
      stops: count('stop'),
      verdict: gate ? gate.verdict : null,
      outcome: outcome ? outcome.label : null,
    };
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.appendFileSync(target, `${JSON.stringify(row)}\n`);
    rows += 1;
  }
  out(`exported ${rows} row(s) to ${target}`);
  return 0;
}

/**
 * Claude Code Stop hook. Blocks stopping while the gate says CONTINUE, so an
 * cela task cannot end without a measured verdict. Tasks without
 * .cela/oracles.json are not cela tasks and are never blocked.
 */
function cmdHookStop(root, argv, out, env, stdin) {
  try {
    return hookStop(root, out, stdin);
  } catch {
    return 0; // a broken task file must never trap the user's session
  }
}

function hookStop(root, out, stdin) {
  let input = {};
  try {
    input = JSON.parse(stdin || '{}');
  } catch {
    input = {};
  }
  if (input.stop_hook_active) return 0;
  const where = repoRoot(input.cwd || root);
  if (!fs.existsSync(taskPaths(where).oracles)) return 0;
  const result = decide(where);
  if (result.verdict !== 'CONTINUE') return 0;
  // A stop the gate refused is the most telling event in the log: the agent
  // was about to report before the measurement agreed. Recorded, never shown.
  try {
    append(where, { kind: 'stop', blocked: true, reasons: result.reasons });
  } catch {
    // the hook must never fail on a logging problem
  }
  const tool = path.relative(where, __filename) || __filename;
  out(JSON.stringify({
    decision: 'block',
    reason: `cela gate says CONTINUE: ${result.reasons.join('; ')}. Fix it and run \`node ${tool} check\` then \`node ${tool} gate\`, or record a blocker with \`node ${tool} note blocker "<why>"\`.`,
  }));
  return 0;
}

// ---------------------------------------------------------------- protocol

/** The constants the protocol is made of, for docs and tests: one source, rendered elsewhere. */
function protocol() {
  return {
    risks: RISKS,
    required: REQUIRED,
    weights: WEIGHTS,
    scores: SCORE,
    scales: SCALES,
    maxRounds: MAX_ROUNDS,
    terminal: TERMINAL,
    notes: NOTE_TYPES,
    outcomes: OUTCOMES,
    memory: { classes: MEMORY_CLASSES, status: MEMORY_STATUS, caps: MEMORY_CAPS },
  };
}

function cmdProtocol(root, argv, out) {
  const f = parseFlags(argv);
  if (f.json) {
    out(JSON.stringify(protocol()));
    return 0;
  }
  const floor = (x) => (x === 10 ? '10' : x === 0 ? '0' : `${x}+`);
  out(`risks: ${RISKS.map((r) => `${r} needs ${REQUIRED[r].join(', ')}`).join('; ')}`);
  out(`oracle weights: ${Object.entries(WEIGHTS).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  out(`oracle score: ${Object.entries(SCALES.oracle).sort((a, b) => b[0] - a[0]).map(([k, v]) => `${k} ${v}`).join('; ')}`);
  out(`Q, the weighted mean, 0-10: ${SCALES.Q.map(([x, name, meaning]) => `${floor(x)} ${name} (${meaning})`).join('; ')}`);
  out(`memory confidence, 0-10: ${Object.entries(SCALES.confidence).sort((a, b) => b[0] - a[0]).map(([k, v]) => `${k} ${v}`).join('; ')}`);
  out(`rounds: ${MAX_ROUNDS}; terminal states: ${TERMINAL.join(', ')}`);
  out(`outcome, set by the reviewer after the gate: ${Object.entries(OUTCOMES).map(([k, v]) => `${k} (${v})`).join('; ')}`);
  return 0;
}

// ---------------------------------------------------------------- main

const HELP = `cela engine

  start --risk LOW|MODERATE|HIGH|CRITICAL --task "<request>" --req "<clause>" [--req ...]
        --files a,b --run "<cmd>" [--run "<cmd>"] [--repro "<cmd>" | --no-defect] [--depth lean|full]
  plan --add a,b [--drop c] --why "<reason>"
  req "<clause>"            add a requirement; cover <R-id> <test-file> "<test name>" covers one
  check [--before]          run the oracles, log the round, print the verdict (--before: run the repro first)
  gate [--json]             reprint the terminal state; exit 0 COMPLETE, 3 CONTINUE, 1 otherwise
  claim "<text>" [--external] [--source s] [--verified] [--off-path]
  note assumption|decision|risk|blocker|question "<text>"
  state [--json]            task summary (--json: machine-readable, read-only)
  outcome accepted|revised|rejected [--why "<text>"] [--task <id>]
                            what happened after the gate; for the reviewer or CI, not the agent
  memory add --class C --fact F --evidence E [--scope project|global] [--tags a,b] [--supersedes id]
  memory search <terms...> | stale <id> [--status S] [--by id] | stats | compact
  export --out <file.jsonl> [--repo <dir>]...
  protocol [--json]         risks, required oracles, weights, and what each score means
  hook-stop                 Claude Code Stop hook (reads JSON on stdin)
`;

const COMMANDS = {
  start: cmdStart,
  plan: cmdPlan,
  req: cmdReq,
  cover: cmdCover,
  check: cmdCheck,
  gate: cmdGate,
  claim: cmdClaim,
  note: cmdNote,
  state: cmdState,
  outcome: cmdOutcome,
  memory: cmdMemory,
  export: cmdExport,
  protocol: cmdProtocol,
  'hook-stop': cmdHookStop,
};

function main(argv, options = {}) {
  const out = options.out || ((line) => process.stdout.write(`${line}\n`));
  const err = options.err || ((line) => process.stderr.write(`${line}\n`));
  // `??` rather than a logical or: Hermes' skill scanner reads that form as
  // an environment dump and blocks URL installs of the skill.
  const env = options.env ?? process.env;
  const cwd = options.cwd || process.cwd();
  const [command, ...rest] = argv;
  if (!command || command === 'help' || command === '--help' || command === '-h' || command === '-help') {
    out(HELP.trimEnd());
    return 0;
  }
  const handler = COMMANDS[command];
  if (!handler) {
    err(`unknown command: ${command}\n\n${HELP}`);
    return 2;
  }
  try {
    const root = repoRoot(cwd);
    if (TASK_COMMANDS.has(command)) assertTaskRoot(root, env);
    return handler(root, rest, out, env, options.stdin);
  } catch (e) {
    if (e instanceof UsageError) {
      err(`error: ${e.message}`);
      return 2;
    }
    throw e;
  }
}

module.exports = { main, decide, protocol, COMMANDS, REQUIRED, WEIGHTS, SCALES, TERMINAL, OUTCOMES, MAX_ROUNDS };

if (require.main === module) {
  let stdin = '';
  if (process.argv[2] === 'hook-stop') {
    try {
      stdin = fs.readFileSync(0, 'utf8');
    } catch {
      stdin = '';
    }
  }
  process.exitCode = main(process.argv.slice(2), { stdin });
}
