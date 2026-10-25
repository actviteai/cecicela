'use strict';

/**
 * Hermes Agent (Nous Research) renders of the cela skill.
 *
 * Hermes reads SKILL.md frontmatter (name, description, version, platforms,
 * metadata.hermes.*), registers /<name> as a slash command, and lists the
 * first 57 characters of the description (plus "...") in the model's skill
 * index, so the description opens with a complete trigger sentence that
 * fits. Unlike Claude Code, Hermes should let the model load the skill on
 * that trigger, so the Claude-only `disable-model-invocation` key is dropped.
 *
 * Hermes replaces ${HERMES_SKILL_DIR} in a skill body with the skill's
 * absolute directory before the model reads it, which gives the model a
 * ready-to-run path to the engine wherever the skill was installed.
 */

const CATEGORY = 'software-development';
const NAME = 'cela';
const INDEX_CHARS = 57;
const TRIGGER = 'Use when the user asks for cela or evidence-gated work.';
const DESCRIPTION = `${TRIGGER} A bundled tool runs the checks and names the verdict, so the model never grades its own work.`;
const TAGS = ['quality-gates', 'evidence-first', 'sdlc', 'coding-agent'];
const PLATFORMS = ['linux', 'macos', 'windows'];
const SKILL_DIR = '${HERMES_SKILL_DIR}';
// The example invocation in SKILL.md, written for a repository install.
const REPO_TOOL = '.agents/skills/cela/tool/cela.js';

function frontmatter(version) {
  return [
    '---',
    `name: ${NAME}`,
    // A JSON string is a valid YAML double-quoted scalar.
    `description: ${JSON.stringify(DESCRIPTION)}`,
    `version: ${version}`,
    'license: GPL-3.0-or-later',
    `platforms: [${PLATFORMS.join(', ')}]`,
    'metadata:',
    '  hermes:',
    `    tags: [${TAGS.join(', ')}]`,
    // The engine runs through the terminal tool; without it the skill cannot work.
    '    requires_toolsets: [terminal]',
    '---',
    '',
  ].join('\n');
}

function split(skillMd) {
  const text = String(skillMd).replace(/\r\n/g, '\n');
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match) throw new Error('SKILL.md has no frontmatter');
  return { head: match[1], body: text.slice(match[0].length) };
}

function replaceOnce(text, from, to) {
  const at = text.indexOf(from);
  if (at === -1 || text.indexOf(from, at + 1) !== -1) {
    throw new Error(`SKILL.md must name ${from} exactly once`);
  }
  return `${text.slice(0, at)}${to}${text.slice(at + from.length)}`;
}

/**
 * The SKILL.md that `install --hermes` writes. The tree is the same as for
 * every other harness (tool/, playbooks/); only the frontmatter and the
 * example tool path differ.
 */
function renderInstalled(skillMd, version) {
  return frontmatter(version) + replaceOnce(split(skillMd).body, REPO_TOOL, `${SKILL_DIR}/tool/cela.js`);
}

/**
 * The SKILL.md for `hermes skills install <url>`. A URL install copies only
 * the files SKILL.md names under scripts/, references/, templates/, assets/,
 * or examples/, so in this variant the engine is scripts/cela.js and the
 * playbooks are references/*.md.
 */
function renderHub(skillMd, version) {
  const body = replaceOnce(split(skillMd).body, REPO_TOOL, `${SKILL_DIR}/scripts/cela.js`)
    .replace(/\btool\/cela\.js\b/g, 'scripts/cela.js')
    .replace(/\bplaybooks\//g, 'references/');
  return frontmatter(version) + body;
}

/**
 * Problems with a Hermes SKILL.md frontmatter, checked against the rules
 * Hermes applies (tools/skills_tool.py, agent/skill_utils.py): a name of at
 * most 64 characters that is also a valid slash command, a description of at
 * most 1024 characters, and known platform names. This parses only the flat
 * subset frontmatter() writes; anything else is reported.
 */
function checkFrontmatter(skillMd, version) {
  const problems = [];
  let head;
  try {
    ({ head } = split(skillMd));
  } catch (err) {
    return [err.message];
  }
  const top = {};
  for (const line of head.split('\n')) {
    const m = /^([a-z][\w-]*):(?: (.*))?$/.exec(line);
    if (m) top[m[1]] = m[2] === undefined ? '' : m[2];
    else if (!/^ {2,}[a-z_]+:/.test(line)) problems.push(`unexpected frontmatter line: ${line}`);
  }
  const name = top.name || '';
  if (!/^[a-z][a-z0-9_-]*$/.test(name) || name.length > 64) problems.push(`invalid name: ${JSON.stringify(name)}`);
  let description = '';
  try {
    description = JSON.parse(top.description || '');
  } catch {
    problems.push('description must be a double-quoted string');
  }
  if (typeof description !== 'string' || !description) problems.push('description is empty');
  else {
    if (description.length > 1024) problems.push(`description is ${description.length} characters; Hermes allows 1024`);
    const first = description.split(/(?<=\.) /)[0];
    if (first.length > INDEX_CHARS) problems.push(`the first sentence of description is ${first.length} characters; Hermes shows ${INDEX_CHARS}`);
  }
  if ('disable-model-invocation' in top) problems.push('disable-model-invocation is a Claude Code key; Hermes should load the skill on its trigger');
  if (version !== undefined && top.version !== version) problems.push(`version is ${top.version}, expected ${version}`);
  const platforms = /^\[(.*)\]$/.exec(top.platforms || '');
  if (!platforms || platforms[1].split(',').map((p) => p.trim()).some((p) => !PLATFORMS.includes(p))) {
    problems.push(`platforms must be a list of ${PLATFORMS.join(', ')}`);
  }
  return problems;
}

module.exports = {
  CATEGORY,
  DESCRIPTION,
  INDEX_CHARS,
  NAME,
  TRIGGER,
  checkFrontmatter,
  frontmatter,
  renderHub,
  renderInstalled,
};
