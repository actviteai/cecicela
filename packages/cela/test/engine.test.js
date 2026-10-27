'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { main } = require('../skill/tool/cela');

const TOOL = path.join(__dirname, '..', 'skill', 'tool', 'cela.js');

function git(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t.invalid', ...args], { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}

/** A tiny repo: src/add.js with a bug, a test that imports it, and a failing repro test. */
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cela-engine-'));
  fs.mkdirSync(path.join(root, 'src'));
  fs.mkdirSync(path.join(root, 'test'));
  fs.writeFileSync(path.join(root, 'src', 'add.js'), "module.exports = (a, b) => a - b;\n");
  fs.writeFileSync(path.join(root, 'test', 'add.test.js'), [
    "const test = require('node:test');",
    "const assert = require('node:assert/strict');",
    "const add = require('../src/add');",
    "test('adds', () => assert.equal(add(2, 3), 5));",
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(root, 'README.md'), 'fixture\n');
  git(root, 'init', '-q');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'init');
  return root;
}

function cela(root, args, extra = {}) {
  const lines = [];
  const errs = [];
  const code = main(args, { cwd: root, out: (l) => lines.push(l), err: (l) => errs.push(l), env: { ...process.env, CELA_HOME: path.join(root, '.home') }, ...extra });
  return { code, out: lines.join('\n'), err: errs.join('\n') };
}

const fix = (root) => fs.writeFileSync(path.join(root, 'src', 'add.js'), "module.exports = (a, b) => a + b;\n");
const TEST_CMD = 'node --test test/*.test.js';
// One requirement, covered by the fixture's own test ("adds"), which imports src/add.js.
const REQ = ['--req', 'adds'];
const cover = (root) => cela(root, ['cover', 'R1', 'test/add.test.js', 'adds']);
const readLog = (root) => fs.readFileSync(path.join(root, '.cela', 'state.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

test('start in a git repo keeps .cela out of git', () => {
  const root = fixture();
  cela(root, ['start', '--risk', 'LOW', '--files', 'src/add.js', '--run', TEST_CMD]);
  assert.match(fs.readFileSync(path.join(root, '.cela', '.gitignore'), 'utf8'), /^\*$/m);
  assert.equal(git(root, 'status', '--porcelain', '--untracked-files=all'), '');
});

test('gate is CONTINUE before any check and UNCLEAR_TASK before start', () => {
  const root = fixture();
  assert.match(cela(root, ['gate']).out, /UNCLEAR_TASK/);
  cela(root, ['start', '--risk', 'LOW', '--files', 'src/add.js', '--run', TEST_CMD]);
  const g = cela(root, ['gate']);
  assert.equal(g.code, 3);
  assert.match(g.out, /CONTINUE/);
});

test('a real fix with an importing test reaches COMPLETE', () => {
  const root = fixture();
  cela(root, ['start', '--risk', 'LOW', '--files', 'src/add.js', '--run', TEST_CMD, ...REQ]);
  const failing = cela(root, ['check']);
  assert.match(failing.out, /runtime\s+fail/);
  fix(root);
  cover(root);
  const passing = cela(root, ['check']);
  assert.match(passing.out, /runtime\s+pass .*imports src\/add\.js/);
  assert.match(passing.out, /repo\s+pass/);
  const g = cela(root, ['gate']);
  assert.equal(g.code, 0, g.out);
  assert.match(g.out, /COMPLETE/);
  assert.match(g.out, /^Report exactly this terminal state: COMPLETE\.$/m);
  assert.doesNotMatch(g.out, /Vibe/i, 'the gate names the state; it adds no catchphrase');
});

test('unplanned files fail the repo oracle until the plan is amended with a reason', () => {
  const root = fixture();
  cela(root, ['start', '--risk', 'LOW', '--files', 'src/add.js', '--run', TEST_CMD, ...REQ]);
  fix(root);
  cover(root);
  fs.writeFileSync(path.join(root, 'notes.txt'), 'stray\n');
  cela(root, ['check']);
  const g = cela(root, ['gate']);
  assert.match(g.out, /CONTINUE/);
  assert.match(g.out, /unplanned: notes\.txt/);
  assert.equal(cela(root, ['plan', '--add', 'notes.txt']).code, 2);
  cela(root, ['plan', '--add', 'notes.txt', '--why', 'release note']);
  cela(root, ['check']);
  assert.match(cela(root, ['gate']).out, /COMPLETE/);
});

test('passing commands that never touch the change are only partial', () => {
  const root = fixture();
  cela(root, ['start', '--risk', 'LOW', '--files', 'README.md', '--run', 'node -e "process.exit(0)"']);
  fs.writeFileSync(path.join(root, 'README.md'), 'changed\n');
  const c = cela(root, ['check']);
  assert.match(c.out, /runtime\s+partial/);
  assert.match(cela(root, ['gate']).out, /runtime is partial/);
});

test('the same failure twice is STALLED', () => {
  const root = fixture();
  cela(root, ['start', '--risk', 'LOW', '--files', 'src/add.js', '--run', TEST_CMD]);
  cela(root, ['check']);
  fs.writeFileSync(path.join(root, 'src', 'add.js'), "module.exports = (a, b) => a * b;\n");
  cela(root, ['check']);
  const g = cela(root, ['gate']);
  assert.equal(g.code, 1);
  assert.match(g.out, /STALLED/);
  assert.match(g.out, /same failure twice/);
});

test('HIGH risk needs a repro that failed before and passes after', () => {
  const root = fixture();
  cela(root, ['start', '--risk', 'HIGH', '--files', 'src/add.js', '--run', TEST_CMD, '--repro', TEST_CMD]);
  fix(root);
  cela(root, ['check']);
  assert.match(cela(root, ['gate']).out, /repro is partial/);

  const again = fixture();
  cela(again, ['start', '--risk', 'HIGH', '--files', 'src/add.js', '--run', TEST_CMD, '--repro', TEST_CMD, ...REQ]);
  assert.match(cela(again, ['check', '--before']).out, /failed as expected/);
  fix(again);
  cover(again);
  cela(again, ['check']);
  assert.match(cela(again, ['gate']).out, /COMPLETE/);
});

test('HIGH risk without repro or --no-defect cannot complete', () => {
  const root = fixture();
  cela(root, ['start', '--risk', 'HIGH', '--files', 'src/add.js', '--run', TEST_CMD]);
  fix(root);
  cela(root, ['check']);
  assert.match(cela(root, ['gate']).out, /repro required/);
});

test('no required command is MISSING_TEST; a blocker note is BLOCKED', () => {
  const root = fixture();
  cela(root, ['start', '--risk', 'LOW', '--files', 'src/add.js']);
  assert.match(cela(root, ['gate']).out, /MISSING_TEST/);
  const other = fixture();
  cela(other, ['start', '--risk', 'LOW', '--files', 'src/add.js', '--run', TEST_CMD]);
  cela(other, ['note', 'blocker', 'needs a production credential']);
  assert.match(cela(other, ['gate']).out, /BLOCKED/);
});

test('editing after a check forces another check', () => {
  const root = fixture();
  cela(root, ['start', '--risk', 'LOW', '--files', 'src/add.js', '--run', TEST_CMD]);
  fix(root);
  cela(root, ['check']);
  fs.appendFileSync(path.join(root, 'src', 'add.js'), '// later edit\n');
  assert.match(cela(root, ['gate']).out, /changed since the last check/);
});

test('an unverified external claim on the changed path fails external', () => {
  const root = fixture();
  cela(root, ['start', '--risk', 'CRITICAL', '--files', 'src/add.js', '--run', TEST_CMD, '--no-defect']);
  cela(root, ['claim', 'the API returns cents', '--external']);
  fix(root);
  cela(root, ['check']);
  assert.match(cela(root, ['gate']).out, /external is fail/);
  cela(root, ['claim', 'the API returns cents', '--external', '--verified', '--source', 'docs/api.md']);
});

test('state.jsonl is append-only and oracles.json holds the plan', () => {
  const root = fixture();
  cela(root, ['start', '--risk', 'LOW', '--files', 'src/add.js', '--run', TEST_CMD]);
  cela(root, ['check']);
  cela(root, ['note', 'decision', 'keep the signature']);
  const log = fs.readFileSync(path.join(root, '.cela', 'state.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(log.map((e) => e.kind), ['start', 'check', 'gate', 'note'], 'check logs the round and the verdict it printed');
  const spec = JSON.parse(fs.readFileSync(path.join(root, '.cela', 'oracles.json'), 'utf8'));
  assert.deepEqual(spec.files, ['src/add.js']);
});

test('memory: add, search, dedupe, secrets, stale, caps', () => {
  const root = fixture();
  const add = (fact, extra = []) => cela(root, ['memory', 'add', '--class', 'OBSERVED', '--fact', fact, '--evidence', 'test/add.test.js', ...extra]);
  const first = add('node --test needs a glob on Node 24');
  assert.equal(first.code, 0, first.err);
  const id = /M-\d{8}-[0-9a-f]{4}/.exec(first.out)[0];
  assert.equal(add('Node --test  needs a glob on node 24').code, 2);
  assert.match(add('token=abcdef123456 works').err, /secret/);
  assert.match(add('x'.repeat(241)).err, /cap is 240/);
  assert.match(cela(root, ['memory', 'search', 'glob']).out, new RegExp(id));
  cela(root, ['memory', 'stale', id]);
  assert.match(cela(root, ['memory', 'search', 'glob']).out, /no matching/);
  for (let i = 0; i < 40; i += 1) assert.equal(add(`fact number ${i}`).code, 0);
  assert.match(add('one too many').err, /MEMORY_CAP/);
});

test('export writes anonymized measurement rows only', () => {
  const root = fixture();
  cela(root, ['start', '--risk', 'LOW', '--task', 'Rewire the adder for the Pelican account', '--files', 'src/add.js', '--run', TEST_CMD, '--req', 'adds for Pelican']);
  cela(root, ['note', 'decision', 'secretive internal detail']);
  fix(root);
  cela(root, ['cover', 'R1', 'test/add.test.js', 'adds']);
  cela(root, ['check']);
  const outFile = path.join(root, 'export.jsonl');
  cela(root, ['export', '--out', outFile]);
  const text = fs.readFileSync(outFile, 'utf8');
  const row = JSON.parse(text);
  assert.equal(row.verdict, 'COMPLETE');
  assert.deepEqual([row.rounds, row.reqs, row.covers, row.task_chars, row.checks[0].band, row.checks[0].insertions, row.checks[0].deletions], [1, 1, 1, 40, 'omega', 1, 1]);
  assert.match(row.id, /^T-\d{8}-[0-9a-f]{4}$/);
  assert.ok(row.checks[0].ms >= 0);
  assert.doesNotMatch(text, /src\/add\.js|secretive|node --test|Pelican|Rewire|adds/, 'no paths, notes, commands, task, or requirement text');
});

test('hook-stop blocks only while the gate says CONTINUE', () => {
  const root = fixture();
  const hook = (input) => spawnSync(process.execPath, [TOOL, 'hook-stop'], { cwd: root, input: JSON.stringify(input), encoding: 'utf8' });
  assert.equal(hook({ cwd: root }).stdout, '');
  cela(root, ['start', '--risk', 'LOW', '--files', 'src/add.js', '--run', TEST_CMD, ...REQ]);
  const blocked = JSON.parse(hook({ cwd: root }).stdout);
  assert.equal(blocked.decision, 'block');
  assert.match(blocked.reason, /CONTINUE/);
  assert.equal(hook({ cwd: root, stop_hook_active: true }).stdout, '');
  const stops = readLog(root).filter((e) => e.kind === 'stop');
  assert.equal(stops.length, 1, 'the refused stop is logged once; a re-entry (stop_hook_active) is not');
  assert.equal(stops[0].blocked, true);
  fix(root);
  cover(root);
  cela(root, ['check']);
  assert.equal(hook({ cwd: root }).stdout, '');
});

test('HIGH with --no-defect completes without a repro', () => {
  const root = fixture();
  cela(root, ['start', '--risk', 'HIGH', '--files', 'src/add.js', '--run', TEST_CMD, '--no-defect', ...REQ]);
  fix(root);
  cover(root);
  cela(root, ['check']);
  assert.match(cela(root, ['gate']).out, /COMPLETE/);
});

test('changing the plan after a passing check invalidates it', () => {
  const root = fixture();
  cela(root, ['start', '--risk', 'LOW', '--files', 'src/add.js', '--run', TEST_CMD, ...REQ]);
  fix(root);
  cover(root);
  assert.match(cela(root, ['check']).out, /cela gate: COMPLETE/);
  cela(root, ['start', '--keep', '--risk', 'LOW', '--files', 'src/add.js', '--run', TEST_CMD, '--run', 'node -e "process.exit(1)"']);
  assert.match(cela(root, ['gate']).out, /plan .* changed since the last check/);
  const spec = JSON.parse(fs.readFileSync(path.join(root, '.cela', 'oracles.json'), 'utf8'));
  assert.deepEqual(spec.reqs, [{ id: 'R1', text: 'adds' }], '--keep keeps the requirements when none are given');
});

test('a new start archives the previous task log and resets the base', () => {
  const root = fixture();
  cela(root, ['start', '--risk', 'LOW', '--files', 'src/add.js', '--run', TEST_CMD]);
  cela(root, ['check']);
  cela(root, ['check']);
  fix(root);
  git(root, 'commit', '-qam', 'fix');
  const again = cela(root, ['start', '--risk', 'LOW', '--files', 'README.md', '--run', TEST_CMD]);
  assert.match(again.out, /archived/);
  const log = fs.readFileSync(path.join(root, '.cela', 'state.jsonl'), 'utf8').trim().split('\n');
  assert.equal(log.length, 1);
  fs.writeFileSync(path.join(root, 'README.md'), 'edited\n');
  assert.match(cela(root, ['check']).out, /check round 1/);
  assert.match(cela(root, ['check']).out, /repo\s+pass/);
});

test('planned paths are normalized', () => {
  const root = fixture();
  cela(root, ['start', '--risk', 'LOW', '--files', './src/add.js', '--run', TEST_CMD]);
  fix(root);
  assert.match(cela(root, ['check']).out, /repo\s+pass/);
});

test('the round cap is hard, even after more edits', () => {
  const root = fixture();
  cela(root, ['start', '--risk', 'LOW', '--files', 'src/add.js', '--run', TEST_CMD]);
  for (const body of ['a * b', 'a / b', 'a % b']) {
    fs.writeFileSync(path.join(root, 'src', 'add.js'), `module.exports = (a, b) => ${body};\n`);
    cela(root, ['check']);
  }
  fix(root);
  const fourth = cela(root, ['check']);
  assert.equal(fourth.code, 2);
  assert.match(fourth.err, /rounds are used/);
  assert.match(cela(root, ['gate']).out, /STALLED/);
});

test('boolean flags do not swallow the claim text', () => {
  const root = fixture();
  cela(root, ['start', '--risk', 'LOW', '--files', 'src/add.js', '--run', TEST_CMD]);
  const c = cela(root, ['claim', '--external', '--verified', 'the docs say so', '--source', 'docs/x.md']);
  assert.equal(c.code, 0, c.err);
  assert.match(c.out, /verified, external/);
});

test('a torn log line is skipped and a broken plan never crashes the hook', () => {
  const root = fixture();
  cela(root, ['start', '--risk', 'LOW', '--files', 'src/add.js', '--run', TEST_CMD]);
  fs.appendFileSync(path.join(root, '.cela', 'state.jsonl'), '{"kind":"che');
  assert.match(cela(root, ['gate']).out, /CONTINUE/);
  fs.writeFileSync(path.join(root, '.cela', 'oracles.json'), '{broken');
  const hook = spawnSync(process.execPath, [TOOL, 'hook-stop'], { cwd: root, input: JSON.stringify({ cwd: root }), encoding: 'utf8' });
  assert.equal(hook.status, 0);
  assert.equal(hook.stdout, '');
});

test('a test that imports only a same-named file elsewhere does not count', () => {
  const root = fixture();
  fs.mkdirSync(path.join(root, 'lib'));
  fs.writeFileSync(path.join(root, 'lib', 'add.js'), 'module.exports = 1;\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'lib');
  cela(root, ['start', '--risk', 'LOW', '--files', 'lib/add.js', '--run', TEST_CMD]);
  fs.writeFileSync(path.join(root, 'lib', 'add.js'), 'module.exports = 2;\n');
  fix(root);
  cela(root, ['plan', '--add', 'src/add.js', '--why', 'fixture']);
  const c = cela(root, ['check']);
  assert.match(c.out, /runtime\s+pass .*imports src\/add\.js/);
});

test('check --before after editing source is flagged', () => {
  const root = fixture();
  cela(root, ['start', '--risk', 'HIGH', '--files', 'src/add.js', '--run', TEST_CMD, '--repro', TEST_CMD]);
  fs.writeFileSync(path.join(root, 'src', 'add.js'), 'module.exports = (a, b) => a * b;\n');
  assert.match(cela(root, ['check', '--before']).out, /source already edited/);
  fix(root);
  cela(root, ['check']);
  assert.match(cela(root, ['gate']).out, /repro is partial/);
});

test('depth is lean or full, from --depth or .cela/depth, and nothing else', () => {
  const root = fixture();
  const begin = (...extra) => cela(root, ['start', '--risk', 'LOW', '--files', 'src/add.js', '--run', TEST_CMD, ...extra]);
  const depth = () => JSON.parse(fs.readFileSync(path.join(root, '.cela', 'oracles.json'), 'utf8')).depth;

  assert.equal(begin().code, 0);
  assert.equal(depth(), 'lean');
  assert.equal(begin('--depth', 'full').code, 0);
  assert.equal(depth(), 'full');

  const ghost = begin('--depth', 'standard');
  assert.equal(ghost.code, 2);
  assert.match(ghost.err, /--depth must be lean\|full$/);
  assert.equal(depth(), 'full', 'a rejected start must not rewrite the plan');

  fs.writeFileSync(path.join(root, '.cela', 'depth'), 'full\n');
  assert.equal(begin().code, 0);
  assert.equal(depth(), 'full');
  fs.writeFileSync(path.join(root, '.cela', 'depth'), 'standard\n');
  const preset = begin();
  assert.equal(preset.code, 2);
  assert.match(preset.err, /\.cela\/depth says "standard"; it must be lean or full/);
  assert.equal(begin('--depth', 'lean').code, 0, '--depth overrides a bad preset');
  assert.equal(depth(), 'lean');
});

test('the engine passes the pattern Hermes scans skills for (environment dumps)', () => {
  // tools/skills_guard.py in Hermes Agent: r'printenv|env\s*\|' marks a skill
  // "caution", and a URL install of a caution skill is blocked.
  const source = fs.readFileSync(TOOL, 'utf8');
  assert.doesNotMatch(source, /printenv|env\s*\|/);
});

test('state --json is machine-readable, matches the gate, and never writes the log', () => {
  const root = fixture();
  const state = () => {
    const r = cela(root, ['state', '--json']);
    assert.equal(r.code, 0, r.err);
    assert.equal(r.out.split('\n').length, 1, 'one JSON line');
    return JSON.parse(r.out);
  };
  const logFile = path.join(root, '.cela', 'state.jsonl');

  const none = state();
  assert.equal(none.task, false);
  assert.equal(none.gate.verdict, 'UNCLEAR_TASK');
  assert.equal(fs.existsSync(path.join(root, '.cela')), false, 'state must not create .cela/');

  cela(root, ['start', '--risk', 'HIGH', '--task', 'make it add', '--files', 'src/add.js', '--run', TEST_CMD, '--no-defect', ...REQ]);
  const fresh = state();
  assert.deepEqual(
    { task: fresh.task, risk: fresh.spec.risk, depth: fresh.spec.depth, files: fresh.spec.files, run: fresh.spec.run, defect: fresh.spec.defect, text: fresh.spec.task, reqs: fresh.spec.reqs },
    { task: true, risk: 'HIGH', depth: 'lean', files: ['src/add.js'], run: [TEST_CMD], defect: false, text: 'make it add', reqs: [{ id: 'R1', text: 'adds' }] },
  );
  assert.deepEqual(fresh.required, ['runtime', 'repo', 'coverage', 'repro']);
  assert.deepEqual([fresh.rounds, fresh.maxRounds, fresh.lastCheck], [0, 3, null]);
  assert.equal(fresh.gate.verdict, 'CONTINUE');

  cela(root, ['check']);
  cela(root, ['note', 'decision', 'keep the signature']);
  const before = fs.readFileSync(logFile, 'utf8');
  const failing = state();
  assert.equal(failing.rounds, 1);
  assert.equal(failing.lastCheck.round, 1);
  assert.equal(failing.lastCheck.oracles.runtime.observed, 'fail');
  assert.ok(failing.lastCheck.failures.length > 0);
  assert.deepEqual(failing.notes.map((n) => [n.type, n.text]), [['decision', 'keep the signature']]);
  assert.equal(failing.gate.verdict, 'CONTINUE');
  assert.equal(fs.readFileSync(logFile, 'utf8'), before, 'state --json is read-only');

  fix(root);
  cover(root);
  cela(root, ['check']);
  const done = state();
  const gate = JSON.parse(cela(root, ['gate', '--json']).out);
  assert.equal(done.gate.verdict, 'COMPLETE');
  assert.deepEqual(done.covers, [{ req: 'R1', file: 'test/add.test.js', text: 'adds' }]);
  assert.equal(done.lastCheck.band, 'omega');
  assert.equal(done.lastCheck.diff.patch, 'rounds/2.patch');
  assert.deepEqual(done.gate, gate, 'state --json reports what gate decides');
  assert.equal(done.lastCheck.oracles.repo.observed, 'pass');
  assert.match(cela(root, ['state']).out, /^risk HIGH, depth lean, rounds 2\/3/, 'plain state is unchanged');
});

test('start refuses a directory that is not a git repository, and writes nothing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cela-nogit-'));
  const r = cela(dir, ['start', '--risk', 'LOW', '--files', 'a.js', '--run', 'true']);
  assert.equal(r.code, 2);
  assert.match(r.err, /is not inside a git repository/);
  assert.equal(fs.existsSync(path.join(dir, '.cela')), false);
});

test('start refuses a git repository with no commits, and writes nothing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cela-nocommit-'));
  git(dir, 'init', '-q');
  const r = cela(dir, ['start', '--risk', 'LOW', '--files', 'a.js', '--run', 'true']);
  assert.equal(r.code, 2);
  assert.match(r.err, /has no commits yet/);
  assert.equal(fs.existsSync(path.join(dir, '.cela')), false);
});

test('task commands never use the cela home as a task directory', () => {
  // The home directory, outside any repository: <home>/.cela is $CELA_HOME.
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cela-home-'));
  const celaHome = path.join(home, '.cela');
  fs.mkdirSync(path.join(celaHome, 'memory'), { recursive: true });
  const env = { ...process.env, HOME: home, USERPROFILE: home, LOCALAPPDATA: path.join(home, "AppData", "Local"), CELA_HOME: celaHome };
  for (const args of [['start', '--risk', 'LOW', '--files', 'a.js', '--run', 'true'], ['note', 'decision', 'x'], ['claim', 'x'], ['req', 'x'], ['cover', 'R1', 'test/a.test.js', 'x'], ['gate'], ['check'], ['state']]) {
    const r = cela(home, args, { env });
    assert.equal(r.code, 2, `${args[0]}: ${r.out}`);
    assert.match(r.err, /is not a project: its \.cela\/ is the cela home/, args[0]);
  }
  assert.deepEqual(fs.readdirSync(celaHome), ['memory']);
  // Memory commands still work from anywhere; they never touch a task.
  const mem = cela(home, ['memory', 'stats'], { env });
  assert.equal(mem.code, 0, mem.err);
});

test('memory ids are never reused, even when the random part collides', (t) => {
  const root = fixture();
  const crypto = require('node:crypto');
  const real = crypto.randomBytes;
  // The first three draws all come back abcd: the second add must skip past the used id.
  let draws = 0;
  t.mock.method(crypto, 'randomBytes', (size) => (draws++ < 3 ? Buffer.from([0xab, 0xcd]) : real(size)));
  const add = (fact, scope = 'project') => cela(root, ['memory', 'add', '--class', 'OBSERVED', '--fact', fact, '--evidence', 'e', '--scope', scope]);
  const ids = [add('first fact'), add('second fact'), add('a global fact', 'global')].map((r) => {
    assert.equal(r.code, 0, r.err);
    return /M-\d{8}-[0-9a-f]+/.exec(r.out)[0];
  });
  assert.equal(new Set(ids).size, 3, ids.join(' '));
  assert.match(ids[0], /-abcd$/);
  assert.match(cela(root, ['memory', 'stats']).out, /project: 2 ACTIVE of 2/);
  assert.match(cela(root, ['memory', 'search', 'first']).out, new RegExp(ids[0]));
  assert.match(cela(root, ['memory', 'search', 'second']).out, new RegExp(ids[1]));
});

test('coverage: every requirement needs a cover that names a test touching the change', () => {
  const root = fixture();
  cela(root, ['start', '--risk', 'LOW', '--files', 'src/add.js', '--run', TEST_CMD, '--req', 'adds two numbers', '--req', 'adds zero']);
  fix(root);
  const first = cela(root, ['check']);
  assert.match(first.out, /coverage fail\s+\[0\] 0\/2 covered; R1 uncovered; R2 uncovered \(required\)/);
  assert.match(first.out, /^cela gate: CONTINUE$/m);
  assert.match(first.out, /coverage is fail/);
  // cover refuses what it cannot see, so a wrong cover never costs a check round
  assert.match(cela(root, ['cover', 'R1', 'src/add.js', 'adds']).err, /not a test file/);
  assert.match(cela(root, ['cover', 'R1', 'test/add.test.js', 'nope']).err, /"nope" is not in test\/add\.test\.js/);
  assert.match(cela(root, ['cover', 'R9', 'test/add.test.js', 'adds']).err, /no requirement R9; listed: R1, R2/);
  assert.equal(cela(root, ['cover', 'r1', 'test/add.test.js', 'adds']).code, 0, 'ids are case-insensitive');
  const half = cela(root, ['check']);
  assert.match(half.out, /coverage partial\s+\[5\] 1\/2 covered; R2 uncovered/, 'the value is covered/total on the 0..10 scale');
  assert.match(half.out, /coverage is partial/);
  fs.appendFileSync(path.join(root, 'test', 'add.test.js'), "test('adds zero', () => assert.equal(add(0, 0), 0));\n");
  cela(root, ['plan', '--add', 'test/add.test.js', '--why', 'a test for R2']);
  assert.equal(cela(root, ['cover', 'R2', 'test/add.test.js', 'adds zero']).code, 0);
  const full = cela(root, ['check']);
  assert.match(full.out, /coverage pass\s+\[10\] 2\/2 requirements covered by tests that touch the change/);
  assert.match(full.out, /^cela gate: COMPLETE$/m);
});

test('a cover whose test neither changed nor imports a changed file does not count', () => {
  const root = fixture();
  fs.writeFileSync(path.join(root, 'test', 'other.test.js'), "const test = require('node:test');\ntest('adds elsewhere', () => {});\n");
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'other test');
  cela(root, ['start', '--risk', 'LOW', '--files', 'src/add.js', '--run', TEST_CMD, ...REQ]);
  fix(root);
  assert.equal(cela(root, ['cover', 'R1', 'test/other.test.js', 'adds elsewhere']).code, 0, 'cover sees the text; only check knows the diff');
  const c = cela(root, ['check']);
  assert.match(c.out, /coverage fail .*test\/other\.test\.js neither changed nor imports a changed file/);
});

test('without requirements the gate asks for them; req adds one and invalidates the last check', () => {
  const root = fixture();
  const s = cela(root, ['start', '--risk', 'LOW', '--files', 'src/add.js', '--run', TEST_CMD]);
  assert.match(s.out, /warning: no requirements listed; the gate needs at least one/);
  fix(root);
  const c = cela(root, ['check']);
  assert.match(c.out, /coverage n\/a .*no requirements listed/);
  assert.match(c.out, /coverage required: list each clause of the request/);
  const r = cela(root, ['req', 'adds two numbers']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^R1 added \(1 requirement\(s\)\)/);
  assert.match(cela(root, ['gate']).out, /plan .* changed since the last check/);
  assert.equal(cela(root, ['req', 'token=abcdef123456']).code, 2, 'a requirement is logged text, so secrets are refused');
  cover(root);
  assert.match(cela(root, ['check']).out, /^cela gate: COMPLETE$/m);
});

test('check prints the verdict and logs it; gate reprints it without running anything', () => {
  const root = fixture();
  cela(root, ['start', '--risk', 'LOW', '--files', 'src/add.js', '--run', TEST_CMD, ...REQ]);
  fix(root);
  cover(root);
  const c = cela(root, ['check']);
  assert.equal(c.code, 0);
  assert.match(c.out, /^check round 1: Q 10 \(omega\)/);
  assert.match(c.out, /^cela gate: COMPLETE$/m);
  assert.match(c.out, /^Report exactly this terminal state: COMPLETE\.$/m);
  assert.doesNotMatch(c.out, /next: run/, 'no second command is needed for the verdict');
  assert.deepEqual(readLog(root).map((e) => e.kind), ['start', 'cover', 'check', 'gate']);
  const g = cela(root, ['gate']);
  assert.equal(g.code, 0);
  assert.deepEqual(readLog(root).map((e) => e.kind), ['start', 'cover', 'check', 'gate', 'gate']);
});

test('the log keeps each round for the record: task, patch, diff stats, command times, refused stops', () => {
  const root = fixture();
  const s = cela(root, ['start', '--risk', 'LOW', '--task', 'make add add', '--files', 'src/add.js', '--run', TEST_CMD, ...REQ]);
  assert.match(s.out, /^started T-\d{8}-[0-9a-f]{4}: risk LOW/);
  fs.writeFileSync(path.join(root, 'notes.txt'), 'untracked\n');
  fix(root);
  cover(root);
  cela(root, ['check']);
  const log = readLog(root);
  assert.equal(log[0].task, 'make add add');
  const check = log.find((e) => e.kind === 'check');
  assert.deepEqual(check.diff, { patch: 'rounds/1.patch', files: 2, insertions: 2, deletions: 1 });
  assert.equal(check.commands.length, 1);
  assert.equal(check.commands[0].code, 0);
  assert.ok(check.commands[0].ms >= 0 && check.ms >= check.commands[0].ms);
  assert.equal(check.band, 'mixed');
  const patch = fs.readFileSync(path.join(root, '.cela', 'rounds', '1.patch'), 'utf8');
  assert.match(patch, /^\+module\.exports = \(a, b\) => a \+ b;$/m);
  assert.match(patch, /^\+untracked$/m, 'untracked files are in the patch too');
  fs.appendFileSync(path.join(root, 'src', 'add.js'), '// edit after the check\n');
  const hook = spawnSync(process.execPath, [TOOL, 'hook-stop'], { cwd: root, input: JSON.stringify({ cwd: root }), encoding: 'utf8' });
  assert.equal(JSON.parse(hook.stdout).decision, 'block');
  const stop = readLog(root).find((e) => e.kind === 'stop');
  assert.equal(stop.blocked, true);
  assert.match(stop.reasons.join(' '), /changed since the last check/);
});

test('a new start archives the whole previous task: log, plan, and patches', () => {
  const root = fixture();
  cela(root, ['start', '--risk', 'LOW', '--files', 'src/add.js', '--run', TEST_CMD, ...REQ]);
  fix(root);
  cela(root, ['check']);
  git(root, 'commit', '-qam', 'fix');
  const again = cela(root, ['start', '--risk', 'LOW', '--files', 'README.md', '--run', TEST_CMD, '--req', 'docs']);
  assert.match(again.out, /previous task archived to \.cela\/archive\/[\dTZ-]+\//);
  const archive = path.join(root, '.cela', 'archive');
  const [stamp] = fs.readdirSync(archive);
  assert.deepEqual(fs.readdirSync(path.join(archive, stamp)).sort(), ['oracles.json', 'rounds', 'state.jsonl']);
  assert.equal(JSON.parse(fs.readFileSync(path.join(archive, stamp, 'oracles.json'), 'utf8')).files[0], 'src/add.js');
  assert.ok(fs.existsSync(path.join(archive, stamp, 'rounds', '1.patch')));
  assert.equal(fs.existsSync(path.join(root, '.cela', 'rounds')), false, 'the new task starts with no patches');
});

test('start recalls memory that matches the task or its files; memory added during a task names it', () => {
  const root = fixture();
  const add = (fact) => cela(root, ['memory', 'add', '--class', 'OBSERVED', '--fact', fact, '--evidence', 'e']);
  assert.equal(add('add.js exports one function; keep the signature').code, 0);
  assert.equal(add('the deploy script wants a vault approle').code, 0);
  const s = cela(root, ['start', '--risk', 'LOW', '--task', 'fix the add function', '--files', 'src/add.js', '--run', TEST_CMD, ...REQ]);
  assert.match(s.out, /memory \(1 matching, `memory search <terms>` for more\):/);
  assert.match(s.out, /add\.js exports one function/);
  assert.doesNotMatch(s.out, /deploy script/);
  const during = add('learned during the task');
  assert.equal(during.code, 0, during.err);
  const dir = path.join(root, '.home', 'projects');
  const records = fs.readFileSync(path.join(dir, fs.readdirSync(dir)[0], 'records.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(records.map((r) => (r.task ? 'task' : null)), [null, null, 'task']);
  assert.match(records[2].task, /^T-\d{8}-[0-9a-f]{4}$/);
});

test('protocol prints the constants the docs are rendered from, with both ends of every scale named', () => {
  const root = fixture();
  const p = JSON.parse(cela(root, ['protocol', '--json']).out);
  assert.deepEqual(p.required.LOW, ['runtime', 'repo', 'coverage']);
  assert.deepEqual(p.required.CRITICAL, ['runtime', 'repo', 'coverage', 'repro', 'external']);
  assert.equal(Object.values(p.weights).reduce((a, b) => a + b, 0), 100);
  assert.deepEqual(p.scales.Q[0], [10, 'omega', 'every measured oracle passed']);
  assert.deepEqual(p.scales.Q[p.scales.Q.length - 1].slice(0, 2), [0, 'alpha']);
  assert.deepEqual(p.terminal, ['COMPLETE', 'STALLED', 'BLOCKED', 'MISSING_TEST', 'UNCLEAR_TASK']);
  const text = cela(root, ['protocol']).out;
  assert.match(text, /Q, the weighted mean, 0-10: 10 omega \(every measured oracle passed\); 8\+ strong .*; 0 alpha \(no measured oracle passed\)/);
  assert.match(text, /memory confidence, 0-10: 10 primary source read, and reproduced; .*; 0 a guess/);
});

test('outcome labels the task after the gate, current or archived, and export carries it beside the verdict', () => {
  const root = fixture();
  const first = cela(root, ['start', '--risk', 'LOW', '--task', 'make add add', '--files', 'src/add.js', '--run', TEST_CMD, ...REQ]);
  const firstId = first.out.match(/started (T-\d{8}-[0-9a-f]{4})/)[1];
  fix(root);
  cover(root);
  assert.match(cela(root, ['check']).out, /COMPLETE/);
  const bad = cela(root, ['outcome', 'shipped']);
  assert.equal(bad.code, 2);
  assert.match(bad.err, /accepted\|revised\|rejected/);
  const labelled = cela(root, ['outcome', 'accepted', '--why', 'merged as is']);
  assert.equal(labelled.code, 0);
  assert.match(labelled.out, new RegExp(`${firstId}: outcome accepted .*; gate said COMPLETE`));
  assert.match(cela(root, ['state']).out, /outcome: accepted \(merged as is\)/);
  assert.equal(JSON.parse(cela(root, ['state', '--json']).out).outcome.label, 'accepted');
  const last = readLog(root).pop();
  assert.deepEqual([last.kind, last.label, last.why, last.verdict], ['outcome', 'accepted', 'merged as is', 'COMPLETE']);

  // The next task archives the first; the first can still be labelled by id, and the label lands in its own log.
  git(root, 'commit', '-qam', 'fix');
  cela(root, ['start', '--risk', 'LOW', '--files', 'README.md', '--run', TEST_CMD, '--req', 'docs']);
  const relabel = cela(root, ['outcome', 'revised', '--task', firstId, '--why', 'reviewer added a boundary test']);
  assert.equal(relabel.code, 0, relabel.err);
  const [stamp] = fs.readdirSync(path.join(root, '.cela', 'archive'));
  const archived = fs.readFileSync(path.join(root, '.cela', 'archive', stamp, 'state.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(archived.filter((e) => e.kind === 'outcome').map((e) => e.label), ['accepted', 'revised']);
  assert.equal(readLog(root).filter((e) => e.kind === 'outcome').length, 0, 'the current task is untouched');
  assert.equal(cela(root, ['outcome', 'rejected', '--task', 'T-19700101-dead']).code, 2);

  const outFile = path.join(root, 'export.jsonl');
  cela(root, ['export', '--out', outFile]);
  const rows = fs.readFileSync(outFile, 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(rows.map((r) => [r.id === firstId, r.verdict, r.outcome]), [[true, 'COMPLETE', 'revised'], [false, null, null]], 'archived task first, then the current one');
  assert.doesNotMatch(fs.readFileSync(outFile, 'utf8'), /boundary test|merged as is/, 'the why never leaves the repository');
  assert.equal(JSON.parse(cela(root, ['protocol', '--json']).out).outcomes.accepted, 'shipped as the gate measured it');
  assert.match(cela(root, ['protocol']).out, /outcome, set by the reviewer after the gate: accepted \(.*\); revised \(.*\); rejected \(discarded\)/);
});

test('the installed engine runs inside a "type": "module" project', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cela-esm-'));
  fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}\n');
  const skill = path.join(root, '.agents', 'skills', 'cela');
  fs.mkdirSync(path.join(skill, 'tool'), { recursive: true });
  fs.copyFileSync(TOOL, path.join(skill, 'tool', 'cela.js'));
  fs.copyFileSync(path.join(__dirname, '..', 'skill', 'package.json'), path.join(skill, 'package.json'));
  const res = spawnSync(process.execPath, [path.join(skill, 'tool', 'cela.js'), 'protocol'], { cwd: root, encoding: 'utf8' });
  assert.doesNotMatch(res.stderr, /require is not defined/);
  assert.equal(res.status, 0, res.stderr);
});
