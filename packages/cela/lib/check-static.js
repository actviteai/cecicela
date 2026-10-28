'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BRIDGE_TEMPLATE = 'bridges/project.md';
const CLAUDE_COMMAND = 'bridges/claude/commands/cela.md';
const BRIDGES = [];

const ROOT = path.resolve(__dirname, '..');
const core = require('./core');
const failures = [];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function ban(rel, pattern, why) {
  if (pattern.test(read(rel))) failures.push(`${rel}: ${why}`);
}

function need(rel, pattern, why) {
  if (!pattern.test(read(rel))) failures.push(`${rel}: ${why}`);
}

ban('skill/install/install-unix.sh', /rm -rf "\$TARGET\/skills\/cela"/, 'must not delete the live skill before the copy succeeds');
ban('skill/install/install-unix.sh', /\|\|\s*true/, 'must not hide copy failures');
need('skill/install/install-unix.sh', /SKILL\.md/, 'must verify the staged skill before swapping');

const pkg = JSON.parse(read('package.json'));
if (JSON.stringify(pkg.bin) !== JSON.stringify({ cela: 'bin/cela.js' })) {
  failures.push('package.json bin must be exactly { cela: bin/cela.js }');
}

for (const rel of ['bin/cela.js', 'lib/installer.js', 'lib/hermes.js', 'lib/skill.js', 'lib/check-static.js', 'lib/version-targets.js', 'skill/tool/cela.js', 'eval/run.js', 'eval/report.js', 'eval/lib/agents.js']) {
  const checked = spawnSync(process.execPath, ['--check', path.join(ROOT, rel)], { encoding: 'utf8' });
  if (checked.status !== 0) {
    failures.push(`${rel}: node --check failed\n${checked.stderr}`);
  }
}

need('skill/README.md', /SKILL\.md` is the instruction source/, 'README must point at SKILL.md and not act as a second protocol');

// Hermes Agent: the installed SKILL.md is rendered from skill/SKILL.md
// at install time, so check the render, not a file on disk.
{
  const hermes = require('../lib/hermes');
  const rendered = hermes.renderInstalled(read('skill/SKILL.md'), pkg.version);
  for (const problem of hermes.checkFrontmatter(rendered, pkg.version)) failures.push(`Hermes SKILL.md render: ${problem}`);
}

// NeMo Agent Toolkit: nemo/ wraps engine commands as tools, so its
// tool names and argument choices must stay the engine's, and the example
// workflow's system prompt must stay the published instructions.md.
{
  const engineSrc = read('skill/tool/cela.js');
  const { COMMANDS } = require('../skill/tool/cela.js');
  const register = read('nemo/src/cela_nat/register.py');
  const quoted = (text, q) => (text.match(new RegExp(`${q}([^${q}]+)${q}`, 'g')) || []).map((s) => s.slice(1, -1));
  const tools = quoted((/^TOOLS = \(([^)]*)\)/m.exec(register) || [])[1] || '', '"');
  if (!tools.length) failures.push('nemo/src/cela_nat/register.py: TOOLS not found');
  for (const tool of tools) {
    if (!Object.prototype.hasOwnProperty.call(COMMANDS, tool)) failures.push(`nemo: tool "${tool}" is not an engine command`);
  }
  for (const name of ['RISKS', 'NOTE_TYPES']) {
    const values = quoted((new RegExp(`^const ${name} = \\[([^\\]]*)\\]`, 'm').exec(engineSrc) || [])[1] || '', "'");
    const literal = `Literal[${values.map((v) => `"${v}"`).join(', ')}]`;
    if (!values.length || !register.includes(literal)) failures.push(`nemo: register.py must offer the engine's ${name} as ${literal}`);
  }
  // workflow.yaml.s system_prompt is rendered from instructions.md (checked below).
}

// No manifest.json: no harness reads one (skills are SKILL.md plus files it
// names), and the rule is JSON only where a program reads it. Both the root
// and the skill manifest were deleted; the check keeps them deleted.
for (const rel of ['manifest.json', 'skill/manifest.json']) {
  if (fs.existsSync(path.join(ROOT, rel))) failures.push(`${rel}: nothing reads it; SKILL.md is the skill's only metadata`);
}
// Every playbook SKILL.md names must exist, and every playbook must be named.
{
  const named = new Set(read('skill/SKILL.md').match(/playbooks\/[\w-]+\.md/g) || []);
  if (named.size === 0) failures.push('skill/SKILL.md: must name its playbooks');
  for (const item of named) {
    if (!fs.existsSync(path.join(ROOT, 'skill', item))) failures.push(`skill/SKILL.md: names a missing file ${item}`);
  }
  for (const file of fs.readdirSync(path.join(ROOT, 'skill/playbooks'))) {
    if (!named.has(`playbooks/${file}`)) failures.push(`skill/playbooks/${file}: SKILL.md never names it, so no run can load it`);
  }
}

// Text the model reads has one form per content type (CONTRIBUTING.md):
// prose for rules, Markdown tables for shaped facts, Mermaid only for
// relationships, numbers rendered from the engine, JSON only for programs.
// This enforces what a script can decide about that.
{
  const MODEL_FACING = [
    'skill/SKILL.md',
    ...fs.readdirSync(path.join(ROOT, 'skill', 'playbooks')).map((f) => `skill/playbooks/${f}`),
    'nemo/instructions.md',
    BRIDGE_TEMPLATE,
    ...BRIDGES,
    CLAUDE_COMMAND,
  ];
  const DIAGRAMS = /^\s*(stateDiagram(-v2)?|flowchart|graph|sequenceDiagram)\b/;
  for (const rel of MODEL_FACING) {
    const lines = read(rel).split('\n');
    let fence = null; // language of the open fenced block
    let table = null; // { start, separator } of the open Markdown table
    lines.forEach((line, i) => {
      const n = i + 1;
      const open = /^\s*```\s*(\S*)/.exec(line);
      if (open) {
        if (fence === null) {
          fence = open[1].toLowerCase();
          if (['json', 'yaml', 'yml'].includes(fence)) failures.push(`${rel}:${n}: a ${fence} block; the model reads prose and tables, programs read JSON`);
          if (fence === 'mermaid' && !DIAGRAMS.test(lines[i + 1] || '')) failures.push(`${rel}:${n}: Mermaid is for relationships only (stateDiagram, flowchart, graph, sequenceDiagram)`);
        } else fence = null;
        return;
      }
      if (fence !== null) return;
      if (/^\s*[[{]\s*"/.test(line)) failures.push(`${rel}:${n}: a raw JSON line in text the model reads`);
      if (/^\s*\|/.test(line)) {
        if (!table) table = { start: n, separator: false };
        if (/^\s*\|\s*:?-{3,}/.test(line)) table.separator = true;
      } else if (table) {
        if (!table.separator) failures.push(`${rel}:${table.start}: a Markdown table without a header separator row`);
        table = null;
      }
    });
    if (table && !table.separator) failures.push(`${rel}:${table.start}: a Markdown table without a header separator row`);
  }
}

// The protocol is a token budget: SKILL.md is loaded on every /cela run.
const skill = read('skill/SKILL.md');
if (Buffer.byteLength(skill) > 6144) failures.push(`skill/SKILL.md is ${Buffer.byteLength(skill)} bytes; keep it under 6144 (about 1.5k tokens)`);
need('skill/SKILL.md', /tool\/cela\.js/, 'SKILL must route measurement through the bundled tool');
need('skill/SKILL.md', /Never say COMPLETE unless `gate` printed COMPLETE/, 'SKILL must forbid self-declared completion');

// The engine is the one source of the protocol's numbers and names. Every
// place that repeats them to a reader (SKILL.md, README) must
// say what `cela protocol --json` says, so a change in the engine cannot
// leave a stale table behind.
{
  const { protocol } = require('../skill/tool/cela.js');
  const p = protocol();
  const readme = read('README.md');
  for (const [name, weight] of Object.entries(p.weights)) {
    const row = new RegExp(`^\\| ${name} \\| ${weight} \\|`, 'm');
    if (!row.test(skill)) failures.push(`skill/SKILL.md: oracle table must have a row "| ${name} | ${weight} |"`);
    if (!row.test(readme)) failures.push(`README.md: oracle table must have a row "| ${name} | ${weight} |"`);
  }
  const low = p.required.LOW.join(', ');
  if (!skill.includes(`LOW and MODERATE need ${low}`)) failures.push(`skill/SKILL.md: must say "LOW and MODERATE need ${low}"`);
  if (!new RegExp(`\\| LOW, MODERATE \\| ${low} \\|`).test(readme)) failures.push(`README.md: risk table must say LOW, MODERATE need ${low}`);
  for (const state of p.terminal) {
    for (const [rel, text] of [['skill/SKILL.md', skill], ['README.md', readme]]) {
      if (!text.includes(state)) failures.push(`${rel}: must name the terminal state ${state}`);
    }
  }
  const [top, , , , bottom] = p.scales.Q;
  const scale = `10 ${top[1]} (${top[2]}), 8+ strong, 5+ mixed, under 5 weak, 0 ${bottom[1]} (nothing passed)`;
  if (!skill.includes(scale)) failures.push(`skill/SKILL.md: the Q scale line must read "${scale}"`);
}
for (const gone of ['core', 'state', 'templates']) {
  if (fs.existsSync(path.join(ROOT, 'skill', gone))) failures.push(`skill/${gone}/ was replaced by the engine and must stay deleted`);
}
for (const bridge of [BRIDGE_TEMPLATE, ...BRIDGES, CLAUDE_COMMAND]) {
  need(bridge, /^Fallback: /m, 'bridge needs a Fallback line the installer can point at the installed core');
}

for (const problem of core.versions.check(ROOT, require('./version-targets'))) failures.push(problem);
// workflow.yaml's system_prompt block is instructions.md, indented for YAML.
{
  const { renderWorkflow } = require('./nemo-workflow');
  if (renderWorkflow(ROOT) !== read('nemo/examples/workflow.yaml')) failures.push('nemo/examples/workflow.yaml is stale; run npm run sync at the repository root');
}

if (failures.length) {
  process.stderr.write(`${failures.join('\n')}\n`);
  process.exit(1);
}

process.stdout.write('static checks ok\n');
