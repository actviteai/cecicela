'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');

const CLI = path.join(__dirname, '..', 'skill', 'tool', 'ceci.js');

function run(args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
}

/** One running job and one blocked behind it, under the given budget header (none for null). */
function work(budget) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ceci-budget-'));
  assert.equal(run(['init', '--work-dir', dir]).status, 0);
  const job = (id, status, deps) => [
    `  - id: ${id}`, `    goal: ${id} job`, '    owner: self', `    depends_on: [${deps}]`, '    schedule: once',
    `    status: ${status}`, '    done_test: t', `    artifact: ${id}.txt`, '    gpu: null', '    cela_gate: null',
  ];
  fs.writeFileSync(path.join(dir, 'state.md'), [
    'title: "deploy the site"',
    ...(budget ? [`budget: ${budget}`] : []),
    'jobs:', ...job('build', 'running', ''), ...job('ship', 'blocked', 'build'), '',
  ].join('\n'));
  return dir;
}

const step = (dir, line) => run(['event', '--work-dir', dir, '--line', line]);
const events = (dir) => fs.readFileSync(path.join(dir, 'state.md'), 'utf8').split('\nevents:\n')[1] || '';

test('budget low (the default) records no step events, only status changes', () => {
  for (const budget of [null, 'low']) {
    const dir = work(budget);
    const res = step(dir, 'build step npm test: 41 pass, 0 fail');
    assert.equal(res.status, 1, budget);
    assert.match(res.stderr, /budget low records no step events/);
    assert.equal(events(dir), '', 'nothing was written');
    assert.equal(step(dir, 'build gate gate:price').status, 0, 'status events still record');
  }
});

test('budget medium allows three steps per job, at real milestones', () => {
  const dir = work('medium');
  for (const line of ['build step tests written: 6', 'build step npm test: 41 pass, 0 fail', 'build step dist/ written: 12 files']) {
    assert.equal(step(dir, line).status, 0, line);
  }
  const fourth = step(dir, 'build step lint: 0 problems');
  assert.equal(fourth.status, 1);
  assert.match(fourth.stderr, /build already has 3 steps, the most budget medium allows/);
  assert.equal(events(dir).split('\n').filter((l) => l.includes(' step ')).length, 3);
  assert.match(fs.readFileSync(path.join(dir, 'state.md'), 'utf8'), /^title: "deploy the site"\nbudget: medium\njobs:/, 'the header survives');
});

test('budget creator records a step for every action, and the screen shows them', () => {
  const dir = work('creator');
  for (let i = 1; i <= 12; i += 1) assert.equal(step(dir, `build step command ${i}: exit 0`).status, 0);
  const screen = run(['status', '--work-dir', dir, '--screen', '--tick', '0']).stdout.split('\n');
  assert.match(screen[0], /0\/2 done {2}creator $/, 'the title names the budget');
  assert.match(screen.join('\n'), /\| \| 12 steps {3}\|/, 'the running box counts real steps');
  assert.match(screen[17], /^ NOW {3}build > command 12: exit 0 +$/, 'the ticker is the newest step');
  assert.match(screen[23], /as of \d\d:\d\dZ$/, 'the footer says when the newest event was recorded');
});

test('every budget is honest: a step needs a running job and says what was done', () => {
  const dir = work('creator');
  const blocked = step(dir, 'ship step deployed: 200 OK');
  assert.equal(blocked.status, 1);
  assert.match(blocked.stderr, /ship is blocked; a step is recorded only on a running job/);
  assert.equal(step(dir, 'build step').status, 2, 'an empty step is refused');
  assert.equal(step(dir, 'nobody step ran').status, 1, 'an unknown job is refused');
  assert.equal(events(dir), '');
  // medium and low draw nothing that low would not, except the ticker of real steps.
  const low = work(null);
  const lowScreen = run(['status', '--work-dir', low, '--screen']).stdout;
  assert.match(lowScreen, / RUN {3}build: /, 'low names the running job, from state.md alone');
  assert.doesNotMatch(lowScreen, / NOW /);
});

test('init --budget sets the header, and prep reports it', () => {
  const dir = work(null);
  const { parseDoc } = require(CLI);
  const before = parseDoc(fs.readFileSync(path.join(dir, 'state.md'), 'utf8'));
  assert.equal(run(['init', '--work-dir', dir, '--budget', 'creator']).status, 0, 'all three files exist; a budget is not an overwrite');
  const after = parseDoc(fs.readFileSync(path.join(dir, 'state.md'), 'utf8'));
  assert.deepEqual(after, { ...before, budget: 'creator' }, 'only the budget changed');
  assert.equal(JSON.parse(run(['prep', '--work-dir', dir, '--json']).stdout).state.budget, 'creator');
  assert.equal(run(['init', '--work-dir', dir, '--budget', 'max']).status, 2);
});
