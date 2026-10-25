'use strict';

/**
 * The chat tier: ceciCela for Projects. Rendered by `npm run chat:build`
 * (part of `npm run sync`); nothing under chat/pack or chat/<host> is edited
 * by hand.
 *
 * Sources:
 *   chat/src/                 the chat deltas: the router, the per-skill chat rules,
 *                             the drawing rules, examples, host setup pages, the player
 *   packages/<skill>/skill/   the CLI protocols the knowledge files carry
 *   packages/core/lib/tui.js  the renderer, inlined into the player
 *
 * Outputs:
 *   chat/pack/                host-agnostic: INSTRUCTIONS.md, knowledge/, graph-player.html
 *   chat/claude, chat/chatgpt, chat/grok   the pack plus that host's SETUP.md
 *   chat/m365/                a Microsoft 365 Agents Toolkit project (declarative agent v1.9)
 *
 * The build fails if a host's instruction text is over its limit.
 */

const fs = require('fs');
const path = require('path');
const { REPO, core, pkg } = require('../lib/repo');

const SRC = path.join(REPO, 'chat', 'src');
const LIMITS = { claude: 8000, chatgpt: 8000, grok: 8000, m365: 8000 };
const read = (...parts) => fs.readFileSync(path.join(...parts), 'utf8').replace(/\r\n/g, '\n');
const text = (t) => ({ text: t, exec: false });
const tui = () => require(path.join(REPO, 'packages', 'core', 'lib', 'tui.js'));

function body(skillMd) {
  const m = /^---\n[\s\S]*?\n---\n/.exec(skillMd);
  return m ? skillMd.slice(m[0].length) : skillMd;
}

/** Drop one `## heading` section (to the next `## ` or the end). */
function dropSection(md, heading) {
  const at = md.indexOf(`\n## ${heading}\n`);
  if (at === -1) throw new Error(`no section "${heading}"`);
  const next = md.indexOf('\n## ', at + 1);
  return md.slice(0, at + 1) + (next === -1 ? '' : md.slice(next + 1));
}

/** Keep one `## heading` section. */
function section(md, heading) {
  const at = md.indexOf(`\n## ${heading}\n`);
  if (at === -1) throw new Error(`no section "${heading}"`);
  const next = md.indexOf('\n## ', at + 1);
  return md.slice(at + 1, next === -1 ? undefined : next + 1).trimEnd();
}

const skill = (name, rel = 'SKILL.md') => read(REPO, 'packages', name, 'skill', rel);
const demote = (md) => md.replace(/^(#{1,5}) /gm, '#$1 ');

/** The audit checklist with every tool step turned into what the user pasted. */
function chatAudit(md) {
  const out = md
    .replace('the last `T check`', 'the latest test output the user pasted')
    .replace(/Fix what you find, then `T check` and `T gate` again\. Report the gate's verdict, not your own\./, 'List what you find, ask for the evidence that would close each item, and end with the REVIEW line. There is no verdict here: only the cela tool in a coding agent names one.');
  if (/\bT (check|gate|protocol)\b|gate's verdict/.test(out)) throw new Error('chat cela checklist still names a tool step');
  return out;
}

/** ceci's protocol without the commands chat cannot run. */
function chatCeci(md) {
  return md.replace(/^## Playbooks\n(?:- `playbooks\/.*\n)+/m, '');
}

function knowledge() {
  const files = new Map();
  files.set('ceci.chat.md', text([
    read(SRC, 'ceci.delta.md').trimEnd(),
    '',
    '---',
    '',
    '# Protocol: /ceci',
    '',
    demote(chatCeci(dropSection(body(skill('ceci')), 'CLI'))).trim(),
    '',
    '# Playbook: job graph',
    '',
    demote(skill('ceci', 'playbooks/graph.md')).replace(/^## # /m, '').trim(),
    '',
    '# Playbook: human gates',
    '',
    demote(skill('ceci', 'playbooks/gates.md')).trim(),
    '',
  ].join('\n')));
  files.set('cela.chat.md', text([
    read(SRC, 'cela.delta.md').trimEnd(),
    '',
    '---',
    '',
    '# Reference: what the cela tool measures in a coding agent',
    '',
    demote(section(body(skill('cela')), 'What the tool measures').replace(/^## What the tool measures\n/, '')).replace(/ `T protocol` prints every scale\./, '').trim(),
    '',
    '# Reference: the audit checklist',
    '',
    chatAudit(demote(skill('cela', 'playbooks/audit.md'))).trim(),
    '',
  ].join('\n')));
  files.set('trouble.chat.md', text([
    read(SRC, 'trouble.delta.md').trimEnd(),
    '',
    '---',
    '',
    body(skill('trouble')).trim(),
    '',
  ].join('\n')));
  files.set('graph-render.md', text(read(SRC, 'graph-render.md')));
  files.set('voices.default.yaml', text(skill('trouble', 'voices.default.yaml')));
  files.set('state.example.md', text(read(SRC, 'state.example.md')));
  for (const name of fs.readdirSync(path.join(SRC, 'examples')).sort()) files.set(`examples/${name}`, text(read(SRC, 'examples', name)));
  files.set('examples/graph-frames.md', text(framesExample()));
  return files;
}

/** `graph frames` in text: the first screen cut at column 27, 54, then whole. */
function framesExample() {
  const T = tui();
  const model = T.fromStateMd(read(SRC, 'state.example.md'));
  const blocks = [27, 54, 80].map((reveal) => `\`\`\`text\n${T.render(model, { tick: 0, reveal }).lines.map((l) => l.trimEnd()).join('\n')}\n\`\`\``);
  return [
    '# Worked example: `graph frames` without a live surface',
    '',
    'The user typed `graph frames` where no artifact, canvas, or Studio window is available. Reveal the first screen column by column in exactly three blocks, then continue with one event line per turn.',
    '',
    ...blocks.flatMap((b) => [b, '']),
  ].join('\n');
}

/**
 * The renderer without its comments or indentation: same code, fewer bytes,
 * because the model emits the player once per conversation. The parity test
 * runs this compacted copy, not the source, against the CLI.
 */
function compact(js) {
  return js
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('//'))
    .join('\n');
}

function player() {
  const state = read(SRC, 'state.example.md');
  const at = state.indexOf('\nevents:\n');
  const stateOnly = at === -1 ? state : state.slice(0, at + 1);
  const events = at === -1 ? [] : tui().fromStateMd(state).events;
  return read(SRC, 'graph-player.html')
    .replace('/*@@TUI@@*/', () => compact(read(REPO, 'packages', 'core', 'lib', 'tui.js')))
    .replace('/*@@STATE@@*/', () => JSON.stringify(stateOnly))
    .replace('/*@@EVENTS@@*/\n', () => events.map((e) => `  ${JSON.stringify(e)},\n`).join(''));
}

function instructions(host) {
  const version = pkg('cecicela').version;
  let t = read(SRC, 'INSTRUCTIONS.md').trimEnd();
  if (host === 'm365') {
    t = t
      .replace("Each one is a file in this Project's knowledge; read the file before you use its protocol, and follow it for that request only.", 'Each one is an agent skill of this agent (ceci, cela, trouble, and graph-view for drawing); load the skill before you use its protocol, and follow it for that request only.')
      .replace('| The user wants | Protocol | Knowledge file |', '| The user wants | Protocol | Agent skill |')
      .replace('`trouble.chat.md`', '`trouble`').replace('`ceci.chat.md`', '`ceci`').replace('`cela.chat.md`', '`cela`')
      .replace("re-uploads `state.md` to this Project's knowledge, or attaches it,", 'attaches `state.md`')
      .replace('If a `state.md` is in knowledge or attached', 'If a `state.md` is attached')
      .replace('Validate it as `trouble.chat.md` says.', 'Validate it as the trouble skill says.')
      .replace('`graph-render.md` is the drawing rule set.', 'The graph-view skill is the drawing rule set.')
      .replace(/When the graph is on and this host can show a live HTML document[\s\S]*?redraw the full 80x24 text screen only when the graph's shape changed or the user asks\./, 'Copilot chat has no live HTML surface, so put the event line in the reply and redraw the full 80x24 text screen in a code block only when the graph\'s shape changed or the user asks.');
  }
  const out = `${t}\n\nPack: ceciCela ${version}.\n`;
  if (out.length > LIMITS[host]) throw new Error(`chat/${host}: instructions are ${out.length} characters; the limit is ${LIMITS[host]}`);
  return out;
}

function packTargets() {
  const files = new Map([['INSTRUCTIONS.md', text(instructions('claude'))], ['graph-player.html', text(player())]]);
  for (const [rel, f] of knowledge()) files.set(`knowledge/${rel}`, f);
  files.set('README.md', text([
    '# chat/pack (generated)',
    '',
    'The host-agnostic ceciCela chat pack, rendered by `npm run chat:build` from `chat/src/` and the CLI skills in `packages/`. Do not edit it here.',
    '',
    '- `INSTRUCTIONS.md`: the router, for the Project\'s instructions slot.',
    '- `knowledge/`: the three protocols (`ceci.chat.md`, `cela.chat.md`, `trouble.chat.md`), the drawing rules, the default role names, an example `state.md`, and worked examples.',
    '- `graph-player.html`: the 80x24 player; the model emits it once per conversation and appends event lines after that.',
    '',
    'Per-host kits with setup steps: `chat/claude/`, `chat/chatgpt/`, `chat/grok/`, `chat/m365/`.',
    '',
  ].join('\n')));
  return files;
}

function hostFiles(host) {
  const files = new Map();
  for (const [rel, f] of packTargets()) if (rel !== 'README.md') files.set(rel, f);
  files.set('INSTRUCTIONS.md', text(instructions(host)));
  files.set('SETUP.md', text(read(SRC, 'hosts', `${host}.md`)));
  if (host === 'chatgpt') files.set('listing.md', text(read(SRC, 'hosts', 'listing.md')));
  return files;
}

const M365_SKILL_LIMIT = 20000;

/** A Copilot agent skill: no Project knowledge, no graph-render.md file, no live HTML surface. */
function agentSkill(name, description, content) {
  const body = content.trim()
    .replace(/`graph-render\.md`/g, 'the graph-view skill')
    .replace(/Project knowledge/g, 'the conversation (the user attaches it)')
    .replace(/`voices\.default\.yaml`/g, '`voices.default.yaml` (in this skill)');
  if (body.length > M365_SKILL_LIMIT) throw new Error(`chat/m365: skill ${name} is ${body.length} characters; the limit is ${M365_SKILL_LIMIT}`);
  return text(`---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n---\n\n${body}\n`);
}

function m365Files() {
  const version = pkg('cecicela').version;
  const k = knowledge();
  const files = new Map();
  const instr = instructions('m365');
  files.set('appPackage/declarativeAgent.json', text(core.gen.json({
    $schema: 'https://developer.microsoft.com/json-schemas/copilot/declarative-agent/v1.9/schema.json',
    version: 'v1.9',
    name: 'ceciCela',
    description: 'Plan it, prove it, fix it. trouble runs a four-roles Bayesian debug protocol on a stuck bug; ceci plans a goal as a job graph with human gates; cela reviews whether a change is really done. The chat entry point to the ceciCela coding-agent skills.',
    instructions: '$[file(\'instruction.txt\')]',
    conversation_starters: [
      { title: 'Stuck bug', text: 'Nothing I try fixes this bug. Here is the error:' },
      { title: 'Plan a goal', text: 'Plan this goal as a job graph with gates:' },
      { title: 'Is it done?', text: 'Is this change really done? Here is the diff and the test output:' },
    ],
    capabilities: [{ name: 'CodeInterpreter' }],
    agent_skills: ['ceci', 'cela', 'trouble', 'graph-view'].map((s) => ({ folder: `./skills/${s}` })),
    disclaimer: { text: 'ceciCela in chat cannot read your files or run commands. trouble caps confidence at 6, ceci plans without running jobs, and cela reviews without measuring. The measured versions run in coding agents.' },
  })));
  files.set('appPackage/instruction.txt', text(instr));
  files.set('appPackage/skills/ceci/SKILL.md', agentSkill('ceci', 'ceciCela planner: turns a goal into a job graph with human gates and hands state back as brief.md and state.md. Use when the user wants a goal planned.', k.get('ceci.chat.md').text));
  files.set('appPackage/skills/cela/SKILL.md', agentSkill('cela', 'ceciCela review checklist: reviews whether a pasted change is really done, without a tool and without a gate. Use when the user asks if a change is done.', k.get('cela.chat.md').text));
  files.set('appPackage/skills/trouble/SKILL.md', agentSkill('trouble', 'ceciCela four-roles debug protocol in untooled mode: verbatim evidence, Bayesian ranking, unanimous gate, TROUBLE_VERDICT. Use for a bug or incident earlier attempts did not fix.', k.get('trouble.chat.md').text));
  files.set('appPackage/skills/trouble/voices.default.yaml', text(skill('trouble', 'voices.default.yaml')));
  files.set('appPackage/skills/graph-view/SKILL.md', agentSkill('graph-view', 'ceciCela graph view: the 80x24 ASCII screen rules and event lines for ceci, trouble, and cela. Use when the graph view is on.', `${k.get('graph-render.md').text}\n\n${k.get('examples/graph-frames.md').text}`));
  files.set('appPackage/manifest.json', text(core.gen.json({
    $schema: 'https://developer.microsoft.com/json-schemas/teams/v1.19/MicrosoftTeams.schema.json',
    manifestVersion: '1.19',
    version,
    id: '${{TEAMS_APP_ID}}',
    developer: {
      name: 'actvite',
      websiteUrl: 'https://www.actvite.com',
      privacyUrl: 'https://www.actvite.com/privacy',
      termsOfUseUrl: 'https://www.actvite.com/tos',
    },
    icons: { color: 'color.png', outline: 'outline.png' },
    name: { short: 'ceciCela${{APP_NAME_SUFFIX}}', full: 'ceciCela: plan it, prove it, fix it' },
    description: {
      short: 'Plan it, prove it, fix it: ceci, cela, and trouble in Copilot.',
      full: 'ceciCela in Microsoft 365 Copilot. trouble runs a four-roles Bayesian debug protocol on a stuck bug and refuses a fix until all four roles agree. ceci turns a goal into a job graph with human gates before contact, posting, payment, or a price. cela reviews whether a change is really done. In chat they cannot read files or run commands, and they say so; the measured versions run in coding agents (npx --yes @actvite/cecicela install --all).',
    },
    accentColor: '#111111',
    copilotAgents: { declarativeAgents: [{ id: 'declarativeAgent', file: 'declarativeAgent.json' }] },
    validDomains: [],
  })));
  // The brand seal (brand/): the full seal with 10% padding, and the figure alone, white on transparent.
  files.set('appPackage/color.png', { buffer: fs.readFileSync(path.join(REPO, 'brand', 'png', 'seal-192.png')), exec: false });
  files.set('appPackage/outline.png', { buffer: fs.readFileSync(path.join(REPO, 'brand', 'png', 'outline-32.png')), exec: false });
  files.set('m365agents.yml', text([
    '# yaml-language-server: $schema=https://developer.microsoft.com/json-schemas/teams-toolkit/teamsapp-yaml/v1.8/yaml.schema.json',
    '# Generated by npm run chat:build. Provision with the Microsoft 365 Agents Toolkit: atk provision --env dev',
    'version: v1.8',
    'environmentFolderPath: ./env',
    'provision:',
    '  - uses: teamsApp/create',
    '    with:',
    '      name: ceciCela${{APP_NAME_SUFFIX}}',
    '    writeToEnvironmentFile:',
    '      teamsAppId: TEAMS_APP_ID',
    '  - uses: teamsApp/validateManifest',
    '    with:',
    '      manifestPath: ./appPackage/manifest.json',
    '  - uses: teamsApp/zipAppPackage',
    '    with:',
    '      manifestPath: ./appPackage/manifest.json',
    '      outputZipPath: ./appPackage/build/appPackage.${{TEAMSFX_ENV}}.zip',
    '      outputFolder: ./appPackage/build',
    '  - uses: teamsApp/validateAppPackage',
    '    with:',
    '      appPackagePath: ./appPackage/build/appPackage.${{TEAMSFX_ENV}}.zip',
    '  - uses: teamsApp/update',
    '    with:',
    '      appPackagePath: ./appPackage/build/appPackage.${{TEAMSFX_ENV}}.zip',
    '  - uses: teamsApp/extendToM365',
    '    with:',
    '      appPackagePath: ./appPackage/build/appPackage.${{TEAMSFX_ENV}}.zip',
    '    writeToEnvironmentFile:',
    '      titleId: M365_TITLE_ID',
    '      appId: M365_APP_ID',
    '',
  ].join('\n')));
  files.set('env/.env.dev', text('# Generated. The Agents Toolkit fills TEAMS_APP_ID, M365_TITLE_ID, and M365_APP_ID on provision.\nTEAMSFX_ENV=dev\nAPP_NAME_SUFFIX=dev\n'));
  files.set('SETUP.md', text(read(SRC, 'hosts', 'm365.md')));
  return files;
}

function targets() {
  return [
    { out: 'chat/pack', why: 'it is rendered from chat/src and the skills', modes: false, files: packTargets() },
    ...['claude', 'chatgpt', 'grok'].map((host) => ({ out: `chat/${host}`, why: 'it is rendered from chat/pack', modes: false, files: hostFiles(host) })),
    // appPackage/build/ and env/.env.dev.user are the toolkit's own output; leave them.
    { out: 'chat/m365', why: 'it is rendered from chat/pack', modes: false, sweep: false, files: m365Files() },
  ];
}

module.exports = { LIMITS, compact, framesExample, instructions, knowledge, player, targets };
