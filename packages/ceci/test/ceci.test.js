'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');

const SKILL = path.join(__dirname, '..', 'skill');
const CLI = path.join(SKILL, 'tool', 'ceci.js');
const PREFS = path.join(SKILL, 'examples', 'gpu-prefs.yaml');
// The cela engine ships in this repository, so the gate test always runs against the engine it will ship with.
const CELA = path.join(__dirname, '..', '..', 'cela', 'skill', 'tool', 'cela.js');

function run(args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
}

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ceci-'));
}

function state(jobs) {
  const lines = ['jobs:'];
  jobs.forEach((job) => {
    lines.push(`  - id: ${job.id}`);
    lines.push(`    goal: ${JSON.stringify(job.goal)}`);
    lines.push(`    owner: ${job.owner}`);
    lines.push(`    depends_on: [${job.depends_on.join(', ')}]`);
    lines.push(`    schedule: ${job.schedule}`);
    lines.push(`    status: ${job.status}`);
    lines.push(`    done_test: ${JSON.stringify(job.done_test)}`);
    lines.push(`    artifact: ${job.artifact}`);
    lines.push(`    gpu: ${job.gpu === null ? 'null' : JSON.stringify(job.gpu)}`);
    lines.push(`    cela_gate: ${job.cela_gate === null ? 'null' : job.cela_gate}`);
  });
  return `${lines.join('\n')}\n`;
}

test('init writes the three templates and will not overwrite them', () => {
  const dir = tmp();
  const created = run(['init', '--work-dir', dir]);
  assert.equal(created.status, 0, created.stderr);
  assert.match(fs.readFileSync(path.join(dir, 'brief.md'), 'utf8'), /set a price/);
  assert.equal(fs.readFileSync(path.join(dir, 'state.md'), 'utf8'), 'jobs: []\n');
  assert.equal(fs.readFileSync(path.join(dir, 'log.md'), 'utf8'), '');
  const again = run(['init', '--work-dir', dir]);
  assert.equal(again.status, 1);
  assert.match(again.stderr, /refusing to overwrite/);
});

test('init fills a missing file and leaves an existing brief untouched', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'brief.md'), 'keep\n');
  const filled = run(['init', '--work-dir', dir]);
  assert.equal(filled.status, 0, filled.stderr);
  assert.equal(fs.readFileSync(path.join(dir, 'brief.md'), 'utf8'), 'keep\n');
  assert.equal(fs.readFileSync(path.join(dir, 'state.md'), 'utf8'), 'jobs: []\n');
  assert.equal(fs.readFileSync(path.join(dir, 'log.md'), 'utf8'), '');
  const again = run(['init', '--work-dir', dir]);
  assert.equal(again.status, 1);
  assert.equal(fs.readFileSync(path.join(dir, 'brief.md'), 'utf8'), 'keep\n');
});

test('resolve-gpu picks the highest-priority free match and exports CUDA', () => {
  const dir = tmp();
  assert.equal(run(['init', '--work-dir', dir]).status, 0);
  const chosen = run(['resolve-gpu', '--work-dir', dir, '--gpu-pref', PREFS, '--model', 'model-large']);
  assert.equal(chosen.status, 0, chosen.stderr);
  assert.equal(chosen.stdout, [
    'host-a:GPU-00000000-0000-0000-0000-00000000000a',
    'CUDA_DEVICE_ORDER=PCI_BUS_ID',
    'CUDA_VISIBLE_DEVICES=GPU-00000000-0000-0000-0000-00000000000a',
    '',
  ].join('\n'));
  const busy = run([
    'resolve-gpu', '--work-dir', dir, '--gpu-pref', PREFS, '--model', 'model-large',
    '--busy', 'host-a:GPU-00000000-0000-0000-0000-00000000000a',
  ]);
  assert.equal(busy.stdout, 'host-b:1\nCUDA_DEVICE_ORDER=PCI_BUS_ID\nCUDA_VISIBLE_DEVICES=1\n');
  const miss = run(['resolve-gpu', '--work-dir', dir, '--gpu-pref', PREFS, '--model', 'model-missing']);
  assert.equal(miss.status, 1);
  const noPref = run(['resolve-gpu', '--work-dir', dir, '--model', 'model-large']);
  assert.equal(noPref.status, 2);
});

test('resolve-gpu never puts a PCI bus id in CUDA_VISIBLE_DEVICES', () => {
  // CUDA_VISIBLE_DEVICES takes indices or UUIDs. An entry it cannot parse
  // hides that device and every device after it, so the job would see none.
  const dir = tmp();
  const prefs = path.join(dir, 'prefs.yaml');
  fs.writeFileSync(prefs, 'hosts:\n  host-a:\n    "0000:01:00.0": { priority: 3, models: ["m"] }\n    "MIG-GPU-abc/1/0": { priority: 2, models: ["n"] }\n');
  const pci = run(['resolve-gpu', '--work-dir', dir, '--gpu-pref', prefs, '--model', 'm']);
  assert.equal(pci.status, 0, pci.stderr);
  assert.equal(pci.stdout, 'host-a:0000:01:00.0\nCUDA_DEVICE_ORDER=PCI_BUS_ID\n');
  assert.match(pci.stderr, /PCI bus id.*index or UUID/);
  assert.match(pci.stderr, /nvidia-smi --query-gpu=index,uuid,pci\.bus_id --format=csv/);
  const mig = run(['resolve-gpu', '--work-dir', dir, '--gpu-pref', prefs, '--model', 'n']);
  assert.equal(mig.stdout, 'host-a:MIG-GPU-abc/1/0\nCUDA_DEVICE_ORDER=PCI_BUS_ID\nCUDA_VISIBLE_DEVICES=MIG-GPU-abc/1/0\n');
  assert.equal(mig.stderr, '');
});

test('state.md round-trips quoted list items that contain commas and brackets', () => {
  const { formatState, parseState } = require(CLI);
  const jobs = [
    { id: 'a,b', goal: 'x', owner: 'self', depends_on: [], schedule: 'once', status: 'done', done_test: 't', artifact: 'a.txt', gpu: null, cela_gate: null },
    { id: 'c]', goal: 'y: z', owner: 'self', depends_on: ['a,b'], schedule: 'once', status: 'ready', done_test: 't', artifact: 'c.txt', gpu: null, cela_gate: null },
  ];
  assert.deepEqual(parseState(formatState(jobs)), jobs);
  const { parsePrefs } = require(CLI);
  assert.deepEqual(parsePrefs('hosts:\n  h:\n    "0": { priority: 1, models: ["a,b", "c"] }\n')[0].models, ['a,b', 'c']);
});

test('a done job needs a real artifact path, not the work dir itself', () => {
  for (const artifact of ['""', '.', './', 'C:\\run\\x.txt', '"\\\\\\\\server\\\\share"']) {
    const dir = tmp();
    run(['init', '--work-dir', dir]);
    fs.writeFileSync(path.join(dir, 'state.md'), `jobs:\n  - id: a\n    goal: g\n    owner: self\n    depends_on: []\n    schedule: once\n    status: done\n    done_test: t\n    artifact: ${artifact}\n    gpu: null\n    cela_gate: null\n`);
    const res = run(['status', '--work-dir', dir]);
    assert.equal(res.status, 1, `${artifact}: ${res.stdout}`);
    assert.match(res.stderr, /artifact/, artifact);
  }
});

test('an empty field names its line', () => {
  const dir = tmp();
  run(['init', '--work-dir', dir]);
  fs.writeFileSync(path.join(dir, 'state.md'), 'jobs:\n  - id: a\n    goal:\n');
  const res = run(['status', '--work-dir', dir]);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /line 3/);
});

test('status lists running jobs so an interrupted run can resume them', () => {
  const dir = tmp();
  run(['init', '--work-dir', dir]);
  fs.writeFileSync(path.join(dir, 'state.md'), state([{
    id: 'build', goal: 'g', owner: 'self', depends_on: [], schedule: 'once', status: 'running',
    done_test: 't', artifact: 'b.txt', gpu: null, cela_gate: null,
  }]));
  const res = run(['status', '--work-dir', dir]);
  assert.equal(res.status, 0, res.stderr);
  assert.equal(res.stdout, 'ready:\nrunning:\n- build\nblocked:\ngate:\n');
});

test('flags accept --name=value, so a log line may start with dashes', () => {
  const dir = tmp();
  run(['init', '--work-dir', dir]);
  const res = run(['log', `--work-dir=${dir}`, '--line=-- a | b | done | c']);
  assert.equal(res.status, 0, res.stderr);
  assert.equal(fs.readFileSync(path.join(dir, 'log.md'), 'utf8'), '-- a | b | done | c\n');
});

test('--help, -h, -help, and help print usage, or one command\'s page, and exit 0', () => {
  for (const args of [['--help'], ['-help'], ['-h'], ['help'], ['help', 'bogus']]) {
    const res = run(args);
    assert.equal(res.status, 0, `${args.join(' ')}: ${res.stderr}`);
    assert.match(res.stdout, /resolve-gpu --work-dir PATH --gpu-pref PATH --model NAME/, args.join(' '));
    assert.match(res.stdout, /ceci prep --work-dir \.\/run/, 'the usage ends with where to start');
  }
  for (const args of [['status', '--help'], ['help', 'status'], ['status', '-help']]) {
    const res = run(args);
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /^usage: ceci status --work-dir PATH/, args.join(' '));
    assert.match(res.stdout, /never exits: run it in your own terminal/);
  }
  for (const command of ['prep', 'init', 'event', 'log', 'archive', 'player', 'resolve-gpu']) {
    const res = run(['help', command]);
    assert.match(res.stdout, new RegExp(`^usage: ceci ${command} --work-dir PATH`), command);
  }
});

test('status exits quietly when its reader closes the pipe', { skip: process.platform === 'win32' && 'needs a POSIX shell and head' }, () => {
  const dir = tmp();
  run(['init', '--work-dir', dir]);
  const jobs = Array.from({ length: 4000 }, (_, i) => ({
    id: `j${i}`, goal: 'g', owner: 'self', depends_on: [], schedule: 'once', status: 'ready',
    done_test: 't', artifact: `j${i}.txt`, gpu: null, cela_gate: null,
  }));
  fs.writeFileSync(path.join(dir, 'state.md'), state(jobs));
  const res = spawnSync('sh', ['-c', `"${process.execPath}" "${CLI}" status --work-dir "${dir}" | head -n 1`], { encoding: 'utf8' });
  assert.equal(res.stdout, 'ready:\n');
  assert.doesNotMatch(res.stderr, /EPIPE|Error/);
});

test('log appends one line and status prints ready, blocked, and gate', () => {
  const dir = tmp();
  run(['init', '--work-dir', dir]);
  const jobs = [
    {
      id: 'score', goal: 'Score the supplied sample', owner: 'self', depends_on: [],
      schedule: 'once', status: 'ready', done_test: 'gate is COMPLETE and the artifact exists',
      artifact: 'score.txt', gpu: null, cela_gate: null,
    },
    {
      id: 'offer', goal: 'Prepare an offer', owner: 'self', depends_on: ['score'],
      schedule: 'once', status: 'blocked', done_test: 'a human supplied the missing decision',
      artifact: 'offer.md', gpu: null, cela_gate: null,
    },
  ];
  fs.writeFileSync(path.join(dir, 'state.md'), state(jobs));
  assert.equal(fs.existsSync(path.join(dir, 'score.txt')), false);
  const listed = run(['status', '--work-dir', dir]);
  assert.equal(listed.status, 0, listed.stderr);
  assert.equal(listed.stdout, 'ready:\n- score\nrunning:\nblocked:\n- offer\ngate:\n');
  const line = '2026-10-21T02:19Z | score | ready | graph written first';
  assert.equal(run(['log', '--work-dir', dir, '--line', line]).status, 0);
  assert.equal(fs.readFileSync(path.join(dir, 'log.md'), 'utf8'), `${line}\n`);
  assert.equal(run(['log', '--work-dir', dir, '--line', 'a\nb']).status, 2);
});

function completeGate() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ceci-cela-'));
  const git = (args) => {
    const res = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
    assert.equal(res.status, 0, res.stderr);
  };
  git(['init', '-q']);
  git(['config', 'user.email', 'test@example.com']);
  git(['config', 'user.name', 'test']);
  fs.mkdirSync(path.join(repo, 'src'));
  fs.mkdirSync(path.join(repo, 'test'));
  fs.writeFileSync(path.join(repo, 'src', 'n.js'), 'exports.n = 1;\n');
  fs.writeFileSync(path.join(repo, 'test', 'n.test.js'), 'const assert = require("assert"); const { n } = require("../src/n.js"); assert.equal(n, 1);\n');
  git(['add', 'src', 'test']);
  git(['commit', '-q', '-m', 'init']);
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ceci-cela-home-'));
  const cela = (args) => spawnSync(process.execPath, [CELA, ...args], { cwd: repo, encoding: 'utf8', env: { ...process.env, CELA_HOME: home } });
  const started = cela(['start', '--risk', 'LOW', '--task', 'n is two', '--req', 'n is two', '--files', 'src/n.js,test/n.test.js', '--run', 'node test/n.test.js', '--no-defect']);
  assert.equal(started.status, 0, started.stderr);
  fs.writeFileSync(path.join(repo, 'src', 'n.js'), 'exports.n = 2;\n');
  fs.writeFileSync(path.join(repo, 'test', 'n.test.js'), 'const assert = require("assert"); const { n } = require("../src/n.js"); assert.equal(n, 2); // n is two\n');
  const covered = cela(['cover', 'R1', 'test/n.test.js', 'n is two']);
  assert.equal(covered.status, 0, covered.stderr);
  const checked = cela(['check']);
  assert.equal(checked.status, 0, checked.stderr);
  const gate = cela(['gate']);
  assert.equal(gate.status, 0, `${gate.stdout}\n${gate.stderr}`);
  return gate.stdout;
}

test('a scoring job stores the cela token and the run stops with a blank price', () => {
  assert.ok(fs.existsSync(CELA), `the cela engine is part of this repository: ${CELA}`);
  const gateText = completeGate();
  const token = /Report exactly this terminal state: ([A-Z_]+)/.exec(gateText);
  assert.ok(token, gateText);
  assert.equal(token[1], 'COMPLETE');

  const dir = tmp();
  assert.equal(run(['init', '--work-dir', dir]).status, 0);
  const deadline = '48h';
  fs.writeFileSync(path.join(dir, 'brief.md'), [
    'number: ""',
    'never: ["contact without yes", "set a price", "post or pay without yes"]',
    `deadline: "${deadline}"`,
    'tools: []',
    '',
  ].join('\n'));

  const jobs = [
    {
      id: 'score', goal: 'Score the supplied sample', owner: 'self', depends_on: [],
      schedule: 'once', status: 'ready', done_test: 'cela gate prints COMPLETE and the artifact exists',
      artifact: 'score.txt', gpu: null, cela_gate: null,
    },
    {
      id: 'offer', goal: 'Prepare an offer', owner: 'self', depends_on: ['score'],
      schedule: 'once', status: 'blocked', done_test: 'a human supplied the missing decision',
      artifact: 'offer.md', gpu: null, cela_gate: null,
    },
  ];
  fs.writeFileSync(path.join(dir, 'state.md'), state(jobs));
  assert.equal(fs.existsSync(path.join(dir, 'score.txt')), false);
  assert.equal(fs.existsSync(path.join(dir, 'offer.md')), false);

  const chosen = run(['resolve-gpu', '--work-dir', dir, '--gpu-pref', PREFS, '--model', 'model-large']);
  assert.equal(chosen.status, 0, chosen.stderr);
  jobs[0].gpu = chosen.stdout.split('\n')[0];
  jobs[0].cela_gate = token[1];
  jobs[0].status = 'done';
  fs.writeFileSync(path.join(dir, 'score.txt'), `${gateText}`);
  fs.writeFileSync(path.join(dir, 'state.md'), state(jobs));
  assert.equal(run(['log', '--work-dir', dir, '--line', '2026-10-21T02:19Z | score | done | cela_gate COMPLETE']).status, 0);

  jobs[1].status = 'gate';
  fs.writeFileSync(path.join(dir, 'state.md'), state(jobs));
  const hand = 'gate: price\njob: offer\nprice:\n';
  assert.equal(hand.split('\n')[2], 'price:');
  assert.equal(fs.existsSync(path.join(dir, 'offer.md')), false);
  assert.equal(run(['log', '--work-dir', dir, '--line', '2026-10-21T02:20Z | offer | gate | price blank']).status, 0);
  assert.equal(fs.readFileSync(path.join(dir, 'log.md'), 'utf8').trim().split('\n').length, 2);
  assert.equal(run(['status', '--work-dir', dir]).stdout, 'ready:\nrunning:\nblocked:\ngate:\n- offer\n');
  const stored = fs.readFileSync(path.join(dir, 'state.md'), 'utf8');
  assert.match(stored, /cela_gate: COMPLETE/);
  assert.doesNotMatch(stored, /price/);
  assert.doesNotMatch(fs.readFileSync(path.join(dir, 'brief.md'), 'utf8'), /notify|qa-bot|@/);
});

test('state.md keeps its title, graph mode, budget, and events through a round trip', () => {
  const { formatState, parseDoc } = require(CLI);
  const jobs = [{ id: 'a', goal: 'g', owner: 'self', depends_on: [], schedule: 'once', status: 'ready', done_test: 't', artifact: 'a.txt', gpu: null, cela_gate: null }];
  const meta = { title: 'ship: it', graph: 'off', budget: 'creator', events: ['a ready', 'a running cela:pending'] };
  const text = formatState(jobs, meta);
  assert.match(text, /^title: "ship: it"\ngraph: off\nbudget: creator\njobs:\n/);
  assert.match(text, /\nevents:\n {2}- "a ready"\n {2}- "a running cela:pending"\n$/);
  const doc = parseDoc(text);
  assert.deepEqual(doc, { title: 'ship: it', graph: 'off', budget: 'creator', jobs, events: meta.events });
  assert.equal(formatState(jobs), formatState(doc.jobs, { title: null, graph: null, budget: null, events: null }));
  assert.throws(() => parseDoc('graph: sideways\njobs: []\n'), /graph must be on, off, or frames/);
  assert.throws(() => parseDoc('budget: huge\njobs: []\n'), /budget must be low, medium, or creator/);
  assert.throws(() => parseDoc('jobs: []\nevents:\n  - "a\\nb"\n'), /one non-empty line/);
  assert.throws(() => parseDoc('jobs: []\nnotes: x\n'), /bad state.md line 2/);
});

test('event moves a job, stores the cela token, and appends the line', () => {
  const dir = tmp();
  run(['init', '--work-dir', dir]);
  fs.writeFileSync(path.join(dir, 'state.md'), state([
    { id: 'a', goal: 'build', owner: 'self', depends_on: [], schedule: 'once', status: 'ready', done_test: 't', artifact: 'a.txt', gpu: null, cela_gate: null },
    { id: 'b', goal: 'ship', owner: 'self', depends_on: ['a'], schedule: 'once', status: 'blocked', done_test: 't', artifact: 'b.txt', gpu: null, cela_gate: null },
  ]));
  const ev = (line) => run(['event', '--work-dir', dir, '--line', line]);
  assert.equal(ev('a running cela:pending').status, 0);
  const early = ev('a done cela:ok');
  assert.equal(early.status, 1);
  assert.match(early.stderr, /a\.txt is missing/);
  fs.writeFileSync(path.join(dir, 'a.txt'), 'x');
  assert.equal(ev('b ready').status, 1, 'b depends on a, which is not done');
  assert.equal(ev('a done cela:ok').status, 0);
  assert.equal(ev('b ready').status, 0);
  assert.equal(ev('a running').status, 1, 'done is terminal');
  assert.match(ev('a done cela:maybe').stderr, /cela: must be/);
  assert.equal(ev('zz done').status, 1);
  const { parseDoc } = require(CLI);
  const doc = parseDoc(fs.readFileSync(path.join(dir, 'state.md'), 'utf8'));
  assert.equal(doc.jobs[0].status, 'done');
  assert.equal(doc.jobs[0].cela_gate, 'COMPLETE');
  assert.deepEqual(doc.events, ['a running cela:pending', 'a done cela:ok', 'b ready']);
  assert.equal(run(['status', '--work-dir', dir]).status, 0);
});

test('status --screen prints the 80x24 graph view and still validates the graph', () => {
  const dir = tmp();
  run(['init', '--work-dir', dir]);
  fs.writeFileSync(path.join(dir, 'state.md'), state([
    { id: 'a', goal: 'build', owner: 'self', depends_on: [], schedule: 'once', status: 'running', done_test: 't', artifact: 'a.txt', gpu: null, cela_gate: null },
    { id: 'b', goal: 'ship', owner: 'self', depends_on: ['a'], schedule: 'once', status: 'blocked', done_test: 't', artifact: 'b.txt', gpu: null, cela_gate: null },
  ]));
  const res = run(['status', '--work-dir', dir, '--screen', '--tick', '1']);
  assert.equal(res.status, 0, res.stderr);
  const lines = res.stdout.replace(/\n$/, '').split('\n');
  assert.equal(lines.length, 24);
  for (const line of lines) assert.equal(line.length, 80);
  assert.match(res.stdout, /^ ceciCela {2}TUI \| ceci: /);
  assert.match(res.stdout, /\|a build {7}\|/);
  assert.match(res.stdout, /\| \/ running {4}\|/);
  assert.match(res.stdout, /^[ -~\n]*$/, 'pure ASCII');
  fs.writeFileSync(path.join(dir, 'state.md'), state([
    { id: 'a', goal: 'build', owner: 'self', depends_on: [], schedule: 'once', status: 'done', done_test: 't', artifact: 'a.txt', gpu: null, cela_gate: null },
  ]));
  const bad = run(['status', '--work-dir', dir, '--screen']);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /a\.txt is missing/);
});
