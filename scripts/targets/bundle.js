'use strict';

/**
 * The plugin and marketplace files every coding-agent host reads, rendered
 * from packages/<skill>/skill and the package.json versions.
 *
 *   bundle/plugins/<p>/               one plugin per package: cecicela (all four
 *                                     skills) and ceci, cela, trouble alone. Each has
 *                                     plugin.json (Grok, Copilot), .claude-plugin/plugin.json,
 *                                     .codex-plugin/plugin.json, and skills/<skill>/ as
 *                                     real files: hosts copy the directory and drop
 *                                     symlinks that leave it.
 *   bundle/plugins/cecicela/bundle.json  the exact skill versions the bundle was built from
 *   bundle/hermes/<skill>/            Hermes URL and hub installs (scripts/, references/)
 *   .claude-plugin/marketplace.json   Claude Code: /plugin marketplace add actviteai/cecicela
 *   .github/plugin/marketplace.json   GitHub Copilot CLI
 *   .grok-plugin/marketplace.json     Grok (+ plugin-index.json for its browser)
 *   .agents/plugins/marketplace.json  Codex
 *
 * The catalogs list the bundle and each skill on its own, so someone who only
 * wants /trouble can install just that.
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
    keywords: ['cecicela', 'ceci', 'cela', 'trouble', 'job-graph', 'quality-gates', 'evidence-first', 'debugging', 'agent-skills'],
  },
  ceci: {
    skills: ['ceci'],
    display: 'ceci',
    short: 'Goal to job graph, with human gates',
    description: 'ceci turns a goal into a job graph, runs ready jobs in dependency order, stops at human gates before contact, posting, payment, or pricing, places GPU jobs, and gates code changes with /cela. Part of ceciCela.',
    keywords: ['ceci', 'cecicela', 'job-graph', 'dag', 'human-in-the-loop', 'approval-gates', 'gpu-scheduling'],
  },
  cela: {
    skills: ['cela'],
    display: 'cela',
    short: 'Evidence gate: a tool names the result',
    description: 'cela is an evidence-first protocol for AI coding agents. A bundled tool runs the checks and names the result (COMPLETE, STALLED, BLOCKED, MISSING_TEST), so the model never grades its own work. Part of ceciCela.',
    keywords: ['cela', 'cecicela', 'quality-gates', 'evidence-first', 'testing', 'agent-skills'],
  },
  trouble: {
    skills: ['trouble'],
    display: '/trouble',
    short: 'Four-roles debug protocol for stuck incidents',
    description: 'Stop looping on a bug you cannot close. /trouble is a four-roles debug protocol that collects verbatim evidence, ranks hypotheses with Bayesian math, and refuses a fix until the roles unanimously agree. Part of ceciCela.',
    keywords: ['trouble', 'cecicela', 'debugging', 'troubleshooting', 'incident-response', 'bayesian', 'four-roles'],
  },
};

const skillDir = (name) => path.join(REPO, 'packages', name, 'skill');
const version = (plugin) => pkg(plugin).version;

function pluginFiles(plugin) {
  const spec = PLUGINS[plugin];
  const v = version(plugin);
  const files = new Map();
  const base = { name: plugin, version: v, description: spec.description, author: AUTHOR, homepage: HOMEPAGE, repository: HOMEPAGE, license: 'GPL-3.0-or-later', keywords: spec.keywords };
  files.set('plugin.json', { text: json({ ...base, skills: 'skills/' }), exec: false });
  files.set('.claude-plugin/plugin.json', { text: json({ ...base, skills: './skills/' }), exec: false });
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

function hermesFiles(skill) {
  if (skill === 'ceci') return require(path.join(REPO, 'packages', 'ceci', 'lib', 'skill')).hermesFiles();
  if (skill === 'cela') {
    const fs = require('fs');
    const hermes = require(path.join(REPO, 'packages', 'cela', 'lib', 'hermes'));
    const dir = skillDir('cela');
    const files = new Map();
    files.set('SKILL.md', { text: hermes.renderHub(fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8'), version('cela')), exec: false });
    files.set('scripts/cela.js', { text: fs.readFileSync(path.join(dir, 'tool', 'cela.js'), 'utf8'), exec: false });
    // Keeps the engine CommonJS when an ancestor package.json sets "type": "module".
    files.set('scripts/package.json', { text: fs.readFileSync(path.join(dir, 'package.json'), 'utf8'), exec: false });
    for (const name of fs.readdirSync(path.join(dir, 'playbooks')).sort()) {
      files.set(`references/${name}`, { text: fs.readFileSync(path.join(dir, 'playbooks', name), 'utf8'), exec: false });
    }
    return files;
  }
  // trouble and the front door install as they are: a hub install copies the directory.
  const files = core.fsx.readTree(skillDir(skill));
  for (const file of files.values()) file.exec = false;
  return files;
}

function entry(plugin) {
  return { name: plugin, version: version(plugin), description: PLUGINS[plugin].description, source: `./bundle/plugins/${plugin}` };
}

function catalogs() {
  const names = Object.keys(PLUGINS);
  const files = new Map();
  const description = `ceciCela marketplace: ${TAGLINE} The bundle and each skill on its own.`;
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
  for (const skill of ['cecicela', ...SKILLS]) {
    out.push({ out: `bundle/hermes/${skill}`, why: 'raw GitHub URLs do not follow it', modes: false, files: hermesFiles(skill) });
  }
  out.push({ out: '', why: 'the catalogs are rendered from package versions', modes: false, sweep: false, files: catalogs() });
  return out;
}

module.exports = { PLUGINS, catalogs, hermesFiles, pluginFiles, targets };
