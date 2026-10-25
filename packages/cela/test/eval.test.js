'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { toolSummary } = require('../eval/lib/agents');
const { stateFootprint, terminalState } = require('../eval/run');

test('eval tasks are sound: hidden tests fail on the start and pass on the reference', () => {
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'eval', 'run.js'), '--self-test'], { encoding: 'utf8' });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /eval self-test ok/);
});

/** One claude stream-json assistant event per tool call. */
function events(...calls) {
  return calls.map(([name, input]) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } }));
}

test('playbooksRead sees both the 1.x numbered and the 2.x named playbooks', () => {
  const summary = toolSummary(events(
    ['Read', { file_path: '/w/.agents/skills/cela/playbooks/01-discover.md' }],
    ['Read', { file_path: '/w/.agents/skills/cela/playbooks/discover.md' }],
    ['Read', { file_path: '/w/.claude/skills/cela/playbooks/audit.md' }],
    ['Bash', { command: 'cat .agents/skills/cela/playbooks/git.md' }],
    ['Read', { file_path: '/w/.agents/skills/cela/playbooks/audit.md' }],
  ));
  assert.deepEqual(summary.playbooksRead, ['playbooks/01-discover.md', 'playbooks/audit.md', 'playbooks/discover.md', 'playbooks/git.md']);
  assert.equal(summary.toolCalls, 5);
});

test('stateWrites counts hand-written task state in both layouts and nothing else', () => {
  const summary = toolSummary(events(
    ['Write', { file_path: '/w/.cela/state/progress.md', content: 'x' }], // 1.x state file
    ['Edit', { file_path: '/w/.cela/state.jsonl', old_string: 'a', new_string: 'b' }], // 2.x: the tool owns this
    ['Write', { file_path: 'C:\\w\\.cela\\oracles.json', content: '{}' }], // 2.x, Windows path
    ['Read', { file_path: '/w/.cela/state.jsonl' }], // reading is fine
    ['Write', { file_path: '/w/src/state.js', content: '.cela/state/ in a comment' }], // not task state
    ['Edit', { file_path: '/w/README.md', old_string: 'a', new_string: 'see .cela/state.jsonl' }],
    ['Bash', { command: 'node .agents/skills/cela/tool/cela.js check' }],
  ));
  assert.equal(summary.stateWrites, 3);
  assert.equal(summary.engineCalls, 1);
});

test('stateFootprint ignores the seeded depth files and measures both layouts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cela-footprint-'));
  const seed = (work) => {
    fs.mkdirSync(path.join(work, '.cela', 'state'), { recursive: true });
    fs.writeFileSync(path.join(work, '.cela', 'state', 'depth.md'), 'value: lean\nset_by: user\n');
    fs.writeFileSync(path.join(work, '.cela', 'depth'), 'lean\n');
  };

  const untouched = path.join(root, 'untouched');
  seed(untouched);
  assert.deepEqual(stateFootprint(untouched), { files: 0, bytes: 0 });
  assert.deepEqual(stateFootprint(path.join(root, 'missing')), { files: 0, bytes: 0 });

  const v1 = path.join(root, 'v1');
  seed(v1);
  fs.writeFileSync(path.join(v1, '.cela', 'state', 'plan.md'), '12345');
  fs.writeFileSync(path.join(v1, '.cela', 'state', 'quality.md'), '123');
  assert.deepEqual(stateFootprint(v1), { files: 2, bytes: 8 });

  const v2 = path.join(root, 'v2');
  seed(v2);
  fs.writeFileSync(path.join(v2, '.cela', 'state.jsonl'), '{"kind":"start"}\n');
  fs.writeFileSync(path.join(v2, '.cela', 'oracles.json'), '{}\n');
  fs.mkdirSync(path.join(v2, '.cela', 'archive'));
  assert.deepEqual(stateFootprint(v2), { files: 2, bytes: 20 });
});

test('terminalState reads gate verdicts, plus the legacy COMPLETE phrase in old transcripts', () => {
  assert.deepEqual(terminalState('cela gate: COMPLETE\nReport exactly this terminal state: COMPLETE.'), ['COMPLETE']);
  assert.deepEqual(terminalState('Gate says STALLED: same failure twice.'), ['STALLED']);
  assert.deepEqual(terminalState('Ended FAILED_VERIFICATION after round 3.'), ['FAILED_VERIFICATION']);
  assert.deepEqual(terminalState('All oracles pass. Vibe Code Build complete.'), ['COMPLETE']);
  assert.deepEqual(terminalState('STATUS: DONE'), []);
});
