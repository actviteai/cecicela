'use strict';

/**
 * The plugin and marketplace files every coding-agent host reads, rendered
 * from packages/<skill>/skill and the package.json versions.
 *
 *   bundle/plugins/cecicela/          the one plugin: all four skills, with
 *                                     plugin.json (Grok, Copilot), .claude-plugin/plugin.json,
 *                                     .codex-plugin/plugin.json, and skills/<skill>/ as
 *                                     real files: hosts copy the directory and drop
 *                                     symlinks that leave it.
 *   bundle/plugins/cecicela/bundle.json  the exact skill versions the bundle was built from
 *   .claude-plugin/marketplace.json   Claude Code: /plugin marketplace add actviteai/cecicela
 *   .github/plugin/marketplace.json   GitHub Copilot CLI
 *   .grok-plugin/marketplace.json     Grok (+ plugin-index.json for its browser)
 *   .agents/plugins/marketplace.json  Codex
 *
 * ceciCela installs as one product: the catalogs list only the bundle, never a
 * skill on its own. Hermes has no bundle install, so it is reached through
 * `npx @actvite/cecicela install --hermes`, which writes all four skills.
 */

const path = require('path');
const { REPO, SKILLS, core, pkg } = require('../lib/repo');

const { json } = core.gen;
const OWNER = { name: 'actvite', email: 'chuck@actvite.com' };
const AUTHOR = { name: 'actvite', email: 'chuck@actvite.com', url: 'https://actvite.com' };
const HOMEPAGE = 'https://github.com/actviteai/cecicela';
const TAGLINE = 'ceci plans this, cela proves that, trouble fixes what breaks.';

const PLUGINS = {
  cecicela: {
    skills: ['cecicela', ...SKILLS],
    display: 'ceciCela',
    short: 'Plan, prove, and debug: /ceci, /cela, /trouble',
    description: `ceciCela: ${TAGLINE} The /ceci job graph with human gates, the /cela evidence gate where a tool names the result, and the /trouble four-roles debug protocol, in one plugin.`,
    keywords: ['cecicela', 'ceci', 'cela', 'trouble', 'agent-skills', 'ai-agent-skills', 'skill-md', 'ai-agents', 'llm', 'agentic-ai', 'job-graph', 'human-in-the-loop', 'quality-gates', 'evidence-first', 'evals', 'debugging', 'root-cause-analysis', 'machine-learning', 'mlops', 'xgboost', 'gpu-scheduling'],
  },
};

const SKILL_LINES = {
  cecicela: '`/cecicela` is the front door: it says which of the three skills fits your task and hands off.',
  ceci: '`/ceci` turns a goal into a job graph, runs ready jobs in dependency order, and stops at a human gate before anything that contacts someone, posts, pays, or sets a price.',
  cela: '`/cela` is the evidence gate. A bundled tool runs your checks and names the result (COMPLETE, STALLED, BLOCKED, MISSING_TEST), so the model never grades its own work.',
  trouble: '`/trouble` is a four-roles debug protocol: collect verbatim evidence, rank hypotheses, and hold the fix until every role agrees.',
};

/**
 * The listing text the Claude directory shows, and the disclosure its security
 * scan reads: what each bundled tool runs, writes, and never does.
 */
function readme(plugin) {
  const spec = PLUGINS[plugin];
  const has = (skill) => spec.skills.includes(skill);
  const lines = [`# ${spec.display}`, ''];
  if (!spec.description.includes(TAGLINE)) lines.push(`> ${TAGLINE}`, '');
  lines.push(spec.description, '', '## Skills', '');
  for (const skill of spec.skills) lines.push(`- ${SKILL_LINES[skill]}`);
  lines.push('', '## For machine learning', '', 'ceciCela keeps an agent from grading its own model changes. /ceci plans an ML pipeline as a job graph and places GPU training jobs from your preference file; /cela accepts a data, feature, or model change only when tests the tool runs pass (for example, holdout AUC not below a stored baseline); /trouble ranks the causes of a metric regression on evidence. It suits XGBoost well: a gate can retrain and score it inside a test, and `device=\"cuda\"` uses the GPU ceci chose. Walkthrough: https://github.com/actviteai/cecicela#xgboost-with-cecicela');
  lines.push('', '## Install', '', 'In Claude Code:', '', '```', `/plugin install ${plugin} --marketplace actviteai/cecicela`, '```', '', 'In claude.ai, the desktop app, or Cowork, add it from **Customize > Plugins**.');
  if (has('ceci')) {
    lines.push('', '## What ceci asks when it starts', '');
    lines.push('Before it plans, ceci reads the job folder (`ceci prep`, which changes nothing) and asks these questions, up to four at a time:', '');
    lines.push('1. **Plan**, when an older plan is there: resume it, start a new one and archive the old one into `runs/` (nothing is deleted), or start a new one in another folder. `--resume`, `--fresh`, or `--new-dir PATH` answers it.');
    lines.push('2. **Brief**, when a brief is there: keep its rules, or edit them before any job starts.');
    lines.push('3. **Animation**: the job graph live in this chat, in your terminal (`ceci status --watch`), or not at all. `--animate chat|terminal|off` answers it.');
    lines.push('4. **Approach**, for a new plan: compare the options first, or name the approach yourself.');
    lines.push('5. **Budget**, when the animation is on: low (only meaningful updates), medium (real milestones), or content creator (every real step, for a live audience). `--budget low|medium|creator` answers it. Every budget shows only work that really happened.', '');
    lines.push('With nobody there to answer, ceci archives the old plan, keeps the brief, turns the animation off, and says so in its first line.');
  }
  lines.push('', '## What runs on your machine', '');
  lines.push('This plugin has no hooks and no MCP servers, and nothing in it opens a network connection or sends data anywhere. Everything below runs only when Claude follows a skill and you allow the command.', '');
  if (has('ceci')) lines.push('- **ceci** (`skills/ceci/tool/ceci.js`, Node.js) reads and writes `brief.md`, `state.md` and `log.md` in the job folder you name, and draws the job graph in the terminal. `ceci archive` moves an old plan and its artifacts into `runs/` in that folder and deletes nothing; `ceci player` writes one HTML file, the graph player, with everything inlined. Neither opens a network connection.');
  if (has('cela')) lines.push('- **cela** (`skills/cela/tool/cela.js`, Node.js) runs the test and check commands you agree on for the task, reads `git diff` and `git status`, and records the results in `.cela/` inside your repository. Its memory lives in `$CELA_HOME` (default `~/.cela`). `skills/cela/install/` holds optional scripts that copy the skill into `$CELA_HOME`; nothing runs them automatically.');
  if (has('trouble')) lines.push('- **trouble** (`skills/trouble/tool/voices.js`, Node.js) reads `voices.default.yaml`, or your own roles file, to name the four debug roles. It writes nothing.');
  lines.push('', '## Links', '', `- Source, issues and docs: ${HOMEPAGE}`, '- Publisher: actvite, https://actvite.com', '', '## License', '', 'GPL-3.0-or-later. See `LICENSE`.', '');
  return lines.join('\n');
}

const skillDir = (name) => path.join(REPO, 'packages', name, 'skill');
const version = (plugin) => pkg(plugin).version;

function pluginFiles(plugin) {
  const spec = PLUGINS[plugin];
  const v = version(plugin);
  const files = new Map();
  const base = { name: plugin, version: v, description: spec.description, author: AUTHOR, homepage: HOMEPAGE, repository: HOMEPAGE, license: 'GPL-3.0-or-later', keywords: spec.keywords };
  files.set('plugin.json', { text: json({ ...base, skills: 'skills/' }), exec: false });
  files.set('.claude-plugin/plugin.json', { text: json({ ...base, skills: './skills/' }), exec: false });
  files.set('README.md', { text: readme(plugin), exec: false });
  files.set('.claude-plugin/icon.svg', { text: require('fs').readFileSync(path.join(REPO, 'brand', 'seal.svg'), 'utf8'), exec: false });
  files.set('LICENSE', { text: require('fs').readFileSync(path.join(REPO, 'LICENSE'), 'utf8'), exec: false });
  files.set('.codex-plugin/plugin.json', {
    text: json({
      ...base,
      skills: './skills/',
      interface: { displayName: spec.display, shortDescription: spec.short, longDescription: spec.description, developerName: 'actvite', category: 'Productivity', websiteURL: HOMEPAGE },
    }),
    exec: false,
  });
  for (const skill of spec.skills) {
    for (const [rel, file] of core.fsx.readTree(skillDir(skill))) files.set(`skills/${skill}/${rel}`, file);
  }
  if (plugin === 'cecicela') {
    const built = { cecicela: v };
    for (const skill of SKILLS) built[skill] = version(skill);
    files.set('bundle.json', { text: json({ name: 'cecicela', version: v, skills: built }), exec: false });
    files.set('agents/cecicela.agent.md', { text: require('fs').readFileSync(path.join(REPO, 'packages', 'cecicela', 'agents', 'cecicela.agent.md'), 'utf8'), exec: false });
  }
  return files;
}

function entry(plugin) {
  return { name: plugin, version: version(plugin), description: PLUGINS[plugin].description, source: `./bundle/plugins/${plugin}` };
}

function catalogs() {
  const names = Object.keys(PLUGINS);
  const files = new Map();
  const description = `ceciCela marketplace: ${TAGLINE} One plugin with all three skills and the /cecicela front door.`;
  files.set('.claude-plugin/marketplace.json', {
    text: json({
      name: 'cecicela',
      description,
      owner: OWNER,
      plugins: names.map((p) => ({ ...entry(p), category: 'development', author: AUTHOR, homepage: HOMEPAGE, tags: PLUGINS[p].keywords })),
    }),
    exec: false,
  });
  files.set('.github/plugin/marketplace.json', {
    text: json({
      name: 'cecicela',
      owner: OWNER,
      metadata: { description, version: version('cecicela') },
      plugins: names.map((p) => ({ ...entry(p), homepage: HOMEPAGE, license: 'GPL-3.0-or-later', keywords: PLUGINS[p].keywords, category: 'development', skills: 'skills/' })),
    }),
    exec: false,
  });
  files.set('.grok-plugin/marketplace.json', {
    text: json({
      name: 'cecicela',
      description,
      owner: OWNER,
      plugins: names.map((p) => ({ ...entry(p), category: 'development', author: AUTHOR, homepage: HOMEPAGE, keywords: PLUGINS[p].keywords, source: { type: 'local', path: `./bundle/plugins/${p}` } })),
    }),
    exec: false,
  });
  files.set('.grok-plugin/plugin-index.json', {
    text: json({
      version: 1,
      plugins: Object.fromEntries(names.map((p) => [p, { version: version(p), components: { skills: PLUGINS[p].skills.map((s) => ({ name: s, description: skillDescription(s) })) } }])),
    }),
    exec: false,
  });
  files.set('.agents/plugins/marketplace.json', {
    text: json({
      name: 'cecicela',
      interface: { displayName: 'ceciCela' },
      plugins: names.map((p) => ({ name: p, source: { source: 'local', path: `./bundle/plugins/${p}` }, policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Productivity' })),
    }),
    exec: false,
  });
  return files;
}

function skillDescription(skill) {
  const text = require('fs').readFileSync(path.join(skillDir(skill), 'SKILL.md'), 'utf8');
  const m = /^description: (.*)$/m.exec(text);
  const raw = m ? m[1].trim() : '';
  return raw.startsWith('"') ? JSON.parse(raw) : raw;
}

function targets() {
  const out = [];
  for (const plugin of Object.keys(PLUGINS)) {
    out.push({ out: `bundle/plugins/${plugin}`, why: 'plugin hosts copy the directory and drop symlinks that leave it', modes: true, files: pluginFiles(plugin) });
  }
  out.push({ out: '', why: 'the catalogs are rendered from package versions', modes: false, sweep: false, files: catalogs() });
  return out;
}

module.exports = { PLUGINS, catalogs, pluginFiles, targets };
