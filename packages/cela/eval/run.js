#!/usr/bin/env node
'use strict';

/**
 * cela eval harness.
 *
 *   node eval/run.js --self-test
 *   node eval/run.js --agents claude:claude-sonnet-5-5 --conditions none,lean,full
 *
 * Each run copies a task repo into a scratch directory, optionally installs
 * cela with `cela init` at a fixed depth, runs the agent headless, then
 * runs the task's visible tests and the hidden tests the agent never saw.
 * One JSON line per run goes to <out>/results.jsonl; eval/report.js
 * summarizes it.
 */

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { cleanEnv, resolveAgent } = require('./lib/agents');

const ROOT = path.resolve(__dirname, '..');
const TASKS = path.join(__dirname, 'tasks');
const CONDITIONS = ['none', 'lean', 'full'];
const HIDDEN_DIR = '.eval-hidden';
// Hidden tests run in a timezone with DST so date bugs cannot hide in UTC.
const HIDDEN_TZ = 'America/New_York';
const STATUS_INSTRUCTION =
  'When you are finished, end your final message with exactly one line: ' +
  '"STATUS: DONE" if the task is complete, or "STATUS: NOT DONE: <reason>" if it is not.';
// CONSTRAINT_LIMITED and FAILED_VERIFICATION are 1.x terminal states; kept so 1.x transcripts still parse.
const TERMINALS = ['COMPLETE', 'BLOCKED', 'STALLED', 'CONSTRAINT_LIMITED', 'FAILED_VERIFICATION', 'UNCLEAR_TASK', 'MISSING_TEST'];
// prepare() seeds these depth files for both protocol versions. They are not agent or tool state.
const SEEDED_STATE = new Set(['state/depth.md', 'depth']);

function parseArgs(argv) {
  const opts = {
    selfTest: false,
    agents: ['claude:claude-sonnet-5-5'],
    conditions: CONDITIONS.slice(),
    tasks: null,
    reps: 1,
    concurrency: 3,
    budgetUsd: 3,
    timeoutMin: 20,
    out: null,
    work: null,
    hook: true,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (value === undefined) throw new Error(`${arg} needs a value`);
      i += 1;
      return value;
    };
    if (arg === '--self-test') opts.selfTest = true;
    else if (arg === '--agents') opts.agents = next().split(',');
    else if (arg === '--conditions') opts.conditions = next().split(',');
    else if (arg === '--tasks') opts.tasks = next().split(',');
    else if (arg === '--reps') opts.reps = Number(next());
    else if (arg === '--concurrency') opts.concurrency = Number(next());
    else if (arg === '--budget-usd') opts.budgetUsd = Number(next());
    else if (arg === '--timeout-min') opts.timeoutMin = Number(next());
    else if (arg === '--out') opts.out = path.resolve(next());
    else if (arg === '--work') opts.work = path.resolve(next());
    else if (arg === '--no-hook') opts.hook = false;
    else throw new Error(`unknown option: ${arg}`);
  }
  for (const c of opts.conditions) {
    if (!CONDITIONS.includes(c)) throw new Error(`unknown condition: ${c}`);
  }
  return opts;
}

function loadTasks(only) {
  const ids = fs.readdirSync(TASKS).filter((id) => fs.existsSync(path.join(TASKS, id, 'task.json'))).sort();
  const tasks = ids.map((id) => ({ ...JSON.parse(fs.readFileSync(path.join(TASKS, id, 'task.json'), 'utf8')), dir: path.join(TASKS, id) }));
  if (!only) return tasks;
  for (const id of only) {
    if (!ids.includes(id)) throw new Error(`unknown task: ${id}`);
  }
  return tasks.filter((t) => only.includes(t.id));
}

function sh(command, args, cwd, env) {
  return spawnSync(command, args, { cwd, env: env || process.env, encoding: 'utf8' });
}

function git(cwd, ...args) {
  const r = sh('git', ['-c', 'user.name=cela-eval', '-c', 'user.email=eval@cela.invalid', ...args], cwd);
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
}

function copyDir(src, dest) {
  fs.cpSync(src, dest, { recursive: true });
}

/** Build the starting repository for one run. */
function prepare(task, condition, workdir, celaHome, hook) {
  copyDir(path.join(task.dir, 'repo'), workdir);
  fs.writeFileSync(path.join(workdir, 'package.json'), `${JSON.stringify({ name: task.id, private: true, scripts: { test: 'node --test' } }, null, 2)}\n`);
  fs.writeFileSync(path.join(workdir, '.gitignore'), 'node_modules/\n');
  if (condition !== 'none') {
    const args = [path.join(ROOT, 'bin', 'cela.js'), 'init', '--quiet'];
    // --hook exists from 2.0; older checkouts reject it, so only pass it when the installer knows it.
    if (hook && fs.readFileSync(path.join(ROOT, 'lib', 'installer.js'), 'utf8').includes("'--hook'")) args.push('--hook');
    const init = sh(process.execPath, args, workdir, { ...process.env, CELA_HOME: celaHome });
    if (init.status !== 0) throw new Error(`cela init failed: ${init.stderr}`);
    // 1.x reads .cela/state/depth.md; 2.x reads .cela/depth.
    fs.mkdirSync(path.join(workdir, '.cela', 'state'), { recursive: true });
    fs.writeFileSync(path.join(workdir, '.cela', 'state', 'depth.md'), `value: ${condition}\nset_by: user\n`);
    fs.writeFileSync(path.join(workdir, '.cela', 'depth'), `${condition}\n`);
  }
  git(workdir, 'init', '-q', '-b', 'main');
  git(workdir, 'add', '-A');
  git(workdir, 'commit', '-q', '-m', 'initial');
  return git(workdir, 'rev-parse', 'HEAD').trim();
}

function countTests(output) {
  const pass = /ℹ pass (\d+)/.exec(output);
  const fail = /ℹ fail (\d+)/.exec(output);
  return { pass: pass ? Number(pass[1]) : 0, fail: fail ? Number(fail[1]) : 0 };
}

function runTests(workdir, target, env) {
  // A parent `node --test` sets NODE_TEST_CONTEXT; inherited, it makes this run report to the parent and exit 0.
  const clean = { ...(env || process.env) };
  delete clean.NODE_TEST_CONTEXT;
  const r = sh(process.execPath, ['--test', target], workdir, clean);
  const out = `${r.stdout}\n${r.stderr}`;
  return { ok: r.status === 0, ...countTests(out), output: out.slice(-4000) };
}

function measure(task, workdir) {
  const visible = runTests(workdir, 'test/**/*.test.js');
  fs.rmSync(path.join(workdir, HIDDEN_DIR), { recursive: true, force: true });
  copyDir(path.join(task.dir, 'hidden'), path.join(workdir, HIDDEN_DIR));
  const hidden = runTests(workdir, `${HIDDEN_DIR}/**/*.test.js`, { ...process.env, TZ: HIDDEN_TZ });
  fs.rmSync(path.join(workdir, HIDDEN_DIR), { recursive: true, force: true });
  return { visible, hidden };
}

// Against the starting commit, so work the agent committed still counts.
function changedFiles(workdir, base) {
  const committed = sh('git', ['diff', '--name-only', base], workdir).stdout;
  const untracked = sh('git', ['ls-files', '--others', '--exclude-standard'], workdir).stdout;
  return [...new Set(`${committed}\n${untracked}`.split('\n').filter(Boolean))].sort();
}

/** The engine's own last verdict, when the agent ran `gate` (cela 2.x). */
function gateVerdict(workdir) {
  const log = path.join(workdir, '.cela', 'state.jsonl');
  if (!fs.existsSync(log)) return null;
  const gates = fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return {};
    }
  }).filter((e) => e.kind === 'gate');
  return gates.length ? gates[gates.length - 1].verdict : null;
}

/**
 * cela task state left in the repository: the 1.x .cela/state/*.md files,
 * or the 2.x .cela/state.jsonl, oracles.json, and rounds/*.patch. The depth files prepare()
 * seeds are excluded, so a run that wrote no state measures 0.
 */
function stateFootprint(workdir) {
  const root = path.join(workdir, '.cela');
  const legacy = path.join(root, 'state');
  const candidates = ['state.jsonl', 'oracles.json'];
  if (fs.existsSync(legacy)) candidates.push(...fs.readdirSync(legacy).map((name) => `state/${name}`));
  // 2.x also keeps the patch each check round measured.
  const rounds = path.join(root, 'rounds');
  if (fs.existsSync(rounds)) candidates.push(...fs.readdirSync(rounds).map((name) => `rounds/${name}`));
  let files = 0;
  let bytes = 0;
  for (const rel of candidates) {
    if (SEEDED_STATE.has(rel)) continue;
    let st;
    try {
      st = fs.statSync(path.join(root, rel));
    } catch {
      continue;
    }
    if (st.isFile()) {
      files += 1;
      bytes += st.size;
    }
  }
  return { files, bytes };
}

function claimed(final) {
  const lines = String(final).trim().split('\n').map((l) => l.trim()).filter(Boolean);
  const status = [...lines].reverse().find((l) => /^\**STATUS:/i.test(l));
  if (!status) return 'MISSING';
  return /NOT DONE/i.test(status) ? 'NOT_DONE' : /DONE/i.test(status) ? 'DONE' : 'MISSING';
}

function terminalState(final) {
  const found = TERMINALS.filter((t) => new RegExp(`\\b${t}\\b`).test(final));
  // Legacy detection only: the 1.x and 2.0.0 tools told the agent to say this
  // on COMPLETE. Newer tools do not, but stored transcripts still contain it.
  if (/Vibe Code Build complete\./.test(final) && !found.includes('COMPLETE')) found.push('COMPLETE');
  return found;
}

function promptFor(task, condition) {
  const body = `${task.prompt}\n\n${STATUS_INSTRUCTION}`;
  return condition === 'none' ? body : `/cela ${body}`;
}

function runAgent(agent, prompt, workdir, env, timeoutMs) {
  const spec = agent.build(prompt, workdir);
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(spec.command, spec.args, { cwd: workdir, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 10000).unref();
    }, timeoutMs);
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => {
      clearTimeout(timer);
      const parsed = agent.parse(stdout, spec);
      resolve({
        ...parsed,
        exitCode: code,
        timedOut,
        durationMs: Date.now() - started,
        rawStdout: stdout,
        rawStderr: stderr.slice(-4000),
        error: timedOut ? 'timeout' : parsed.error,
      });
    });
  });
}

async function runOne(job, opts) {
  const { task, condition, agent, rep } = job;
  const id = `${task.id}__${condition}__${agent.name.replace(/[^\w.-]+/g, '_')}__r${rep}`;
  const base = path.join(opts.work, id);
  const workdir = path.join(base, 'repo');
  const celaHome = path.join(base, 'cela-home');
  fs.rmSync(base, { recursive: true, force: true });
  fs.mkdirSync(base, { recursive: true });
  const base0 = prepare(task, condition, workdir, celaHome, opts.hook);

  const env = cleanEnv({ CELA_HOME: celaHome });
  const result = await runAgent(agent, promptFor(task, condition), workdir, env, opts.timeoutMin * 60000);
  const tests = measure(task, workdir);
  const claim = claimed(result.final);
  const record = {
    id,
    task: task.id,
    kind: task.kind,
    risk: task.risk,
    condition,
    agent: agent.name,
    rep,
    celaVersion: JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version,
    claimed: claim,
    terminal: terminalState(result.final),
    visiblePass: tests.visible.ok,
    hiddenPass: tests.hidden.ok,
    hiddenTests: { pass: tests.hidden.pass, fail: tests.hidden.fail },
    falseDone: claim === 'DONE' && !tests.hidden.ok,
    gate: gateVerdict(workdir),
    hook: condition !== 'none' && opts.hook,
    turns: result.turns ?? null,
    tokensIn: result.tokensIn ?? null,
    tokensOut: result.tokensOut ?? null,
    costUsd: result.costUsd ?? null,
    durationMs: result.durationMs,
    changedFiles: changedFiles(workdir, base0).filter((f) => !f.startsWith('.cela/')),
    commits: Number(git(workdir, 'rev-list', '--count', `${base0}..HEAD`).trim()),
    toolCalls: result.toolCalls ?? null,
    skillRead: result.skillRead ?? null,
    playbooksRead: result.playbooksRead ?? null,
    stateWrites: result.stateWrites ?? null,
    engineCalls: result.engineCalls ?? null,
    state: stateFootprint(workdir),
    error: result.error || null,
  };
  fs.writeFileSync(path.join(base, 'final.md'), result.final || '');
  fs.writeFileSync(path.join(base, 'agent-stdout.txt'), result.rawStdout);
  fs.writeFileSync(path.join(base, 'tests.json'), JSON.stringify(tests, null, 2));
  return record;
}

async function pool(jobs, size, worker) {
  const results = [];
  let next = 0;
  async function lane() {
    while (next < jobs.length) {
      const job = jobs[next];
      next += 1;
      results.push(await worker(job));
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, size) }, lane));
  return results;
}

/** Prove every task is sound: hidden tests fail on the starting code and pass on the reference solution. */
function selfTest() {
  const failures = [];
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cela-eval-self-'));
  for (const task of loadTasks(null)) {
    for (const part of ['repo', 'hidden', 'solution']) {
      if (!fs.existsSync(path.join(task.dir, part))) failures.push(`${task.id}: missing ${part}/`);
    }
    if (!task.prompt || !task.kind || !task.risk) failures.push(`${task.id}: task.json needs prompt, kind, risk`);
    const start = path.join(scratch, task.id, 'start');
    copyDir(path.join(task.dir, 'repo'), start);
    if (measure(task, start).hidden.ok) failures.push(`${task.id}: hidden tests already pass on the starting code`);
    const solved = path.join(scratch, task.id, 'solved');
    copyDir(path.join(task.dir, 'repo'), solved);
    copyDir(path.join(task.dir, 'solution'), solved);
    const after = measure(task, solved);
    if (!after.visible.ok) failures.push(`${task.id}: reference solution fails visible tests\n${after.visible.output}`);
    if (!after.hidden.ok) failures.push(`${task.id}: reference solution fails hidden tests\n${after.hidden.output}`);
  }
  fs.rmSync(scratch, { recursive: true, force: true });
  if (failures.length) {
    process.stderr.write(`${failures.join('\n')}\n`);
    return 1;
  }
  process.stdout.write(`eval self-test ok (${loadTasks(null).length} tasks)\n`);
  return 0;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.selfTest) return selfTest();

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  opts.out = opts.out || path.join(__dirname, 'results', stamp);
  opts.work = opts.work || path.join(os.tmpdir(), `cela-eval-${stamp}`);
  fs.mkdirSync(opts.out, { recursive: true });
  const agents = opts.agents.map((id) => resolveAgent(id, { budgetUsd: opts.budgetUsd }));
  const jobs = [];
  for (let rep = 1; rep <= opts.reps; rep += 1) {
    for (const task of loadTasks(opts.tasks)) {
      for (const condition of opts.conditions) {
        for (const agent of agents) jobs.push({ task, condition, agent, rep });
      }
    }
  }
  const sink = path.join(opts.out, 'results.jsonl');
  process.stdout.write(`${jobs.length} runs -> ${sink}\nscratch: ${opts.work}\n`);
  let done = 0;
  await pool(jobs, opts.concurrency, async (job) => {
    let record;
    try {
      record = await runOne(job, opts);
    } catch (err) {
      record = { task: job.task.id, condition: job.condition, agent: job.agent.name, rep: job.rep, error: `harness: ${err.message}` };
    }
    fs.appendFileSync(sink, `${JSON.stringify(record)}\n`);
    done += 1;
    const verdict = record.error ? `ERROR ${record.error}` : `hidden=${record.hiddenPass ? 'pass' : 'FAIL'} claimed=${record.claimed}`;
    process.stdout.write(`[${done}/${jobs.length}] ${job.task.id} ${job.condition} ${job.agent.name}: ${verdict}\n`);
    return record;
  });
  return 0;
}

if (require.main === module) {
  main().then((code) => { process.exitCode = code; }, (err) => {
    process.stderr.write(`error: ${err.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { claimed, stateFootprint, terminalState };
