#!/usr/bin/env node
'use strict';

/**
 * The /trouble role names: find, validate, and print them.
 *
 *   node tool/voices.js resolve [--project DIR] [--home DIR]   the names this run uses, and where they came from
 *   node tool/voices.js check FILE                             exit 0 if FILE is a valid voices file
 *
 * Lookup order: <project>/.trouble/voices.yaml, then ~/.trouble/voices.yaml,
 * then voices.default.yaml next to SKILL.md. A file that is not valid is
 * refused with its reasons, and the defaults are used instead.
 *
 * A valid file has exactly the ids keeper, detective, maintainer, physicist,
 * each with a who: and nothing else. Zero dependencies; reads only the small
 * YAML subset below:
 *
 *   voices:
 *     keeper: {who: "the archivist"}
 *     detective:
 *       who: the detective
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const IDS = ['keeper', 'detective', 'maintainer', 'physicist'];
const MAX_WHO = 80;
const DEFAULT_FILE = path.join(__dirname, '..', 'voices.default.yaml');

function unquote(raw) {
  const text = String(raw).trim();
  if (text.startsWith('"')) {
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`bad quoted string ${text}`);
    }
  }
  if (text.startsWith("'") && text.endsWith("'") && text.length >= 2) return text.slice(1, -1).replace(/''/g, "'");
  return text;
}

/** {who: "x"} or {who: x} -> { who: 'x' }. Only flat key: value pairs. */
function parseFlowMap(raw) {
  const inner = raw.trim().replace(/^\{/, '').replace(/\}$/, '');
  const out = {};
  if (!inner.trim()) return out;
  // Split on commas outside quotes.
  const parts = [];
  let start = 0;
  let quote = null;
  for (let i = 0; i < inner.length; i += 1) {
    const c = inner[i];
    if (quote) {
      if (c === '\\' && quote === '"') i += 1;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === ',') {
      parts.push(inner.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(inner.slice(start));
  for (const part of parts) {
    const m = /^\s*([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(part);
    if (!m) throw new Error(`bad entry ${part.trim()}`);
    out[m[1]] = unquote(m[2]);
  }
  return out;
}

/** Drop a trailing `# comment`, but not a # inside quotes ("Agent #1"). */
function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (quote) {
      if (c === '\\' && quote === '"') i += 1;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i).replace(/\s+$/, '');
  }
  return line;
}

/** Parse a voices file into { id: { key: value } }. Throws on text it cannot read. */
function parse(text) {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  const roles = {};
  let seenRoot = false;
  let current = null;
  lines.forEach((line, index) => {
    const n = index + 1;
    if (!line.trim() || /^\s*#/.test(line)) return;
    const body = stripComment(line);
    if (!seenRoot) {
      if (body.trim() !== 'voices:') throw new Error(`line ${n}: the file must start with voices:`);
      seenRoot = true;
      return;
    }
    const role = /^ {2}([A-Za-z_][\w-]*):\s*(.*)$/.exec(body);
    if (role) {
      if (Object.prototype.hasOwnProperty.call(roles, role[1])) throw new Error(`line ${n}: ${role[1]} is defined twice`);
      const rest = role[2].trim();
      if (rest.startsWith('{')) {
        roles[role[1]] = parseFlowMap(rest);
        current = null;
      } else if (rest === '') {
        roles[role[1]] = {};
        current = role[1];
      } else {
        throw new Error(`line ${n}: ${role[1]} must be a map like {who: "..."}`);
      }
      return;
    }
    const field = /^ {4}([A-Za-z_][\w-]*):\s*(.*)$/.exec(body);
    if (field && current) {
      roles[current][field[1]] = unquote(field[2]);
      return;
    }
    throw new Error(`line ${n}: cannot read "${line.trim()}"`);
  });
  if (!seenRoot) throw new Error('the file is empty; it must start with voices:');
  return roles;
}

/** Reasons a parsed voices map is refused; [] when it is valid. */
function problems(roles) {
  const out = [];
  const ids = Object.keys(roles);
  for (const id of ids) {
    if (!IDS.includes(id)) out.push(`unknown role ${id}; the roles are exactly ${IDS.join(', ')}`);
  }
  for (const id of IDS) {
    if (!ids.includes(id)) out.push(`missing role ${id}`);
  }
  if (ids.length !== IDS.length && !out.some((p) => p.startsWith('unknown') || p.startsWith('missing'))) {
    out.push(`expected ${IDS.length} roles, found ${ids.length}`);
  }
  for (const id of ids.filter((x) => IDS.includes(x))) {
    const role = roles[id];
    for (const key of Object.keys(role)) {
      if (key !== 'who') out.push(`${id}: only who: may be set (${key}: is the protocol and cannot change)`);
    }
    const who = role.who;
    if (typeof who !== 'string' || !who.trim()) out.push(`${id}: who: is empty`);
    else if (/[\r\n]/.test(who)) out.push(`${id}: who: must be one line`);
    else if (who.length > MAX_WHO) out.push(`${id}: who: is ${who.length} characters; keep it to ${MAX_WHO}`);
  }
  return out;
}

function load(file) {
  let roles;
  try {
    roles = parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return { ok: false, file, reasons: [err.code === 'ENOENT' ? `${file} does not exist` : err.message] };
  }
  const reasons = problems(roles);
  return reasons.length ? { ok: false, file, reasons } : { ok: true, file, roles };
}

function defaults() {
  const got = load(DEFAULT_FILE);
  if (!got.ok) throw new Error(`the packaged voices.default.yaml is invalid: ${got.reasons.join('; ')}`);
  return got.roles;
}

/** The names this run uses: { roles, source, refused: [{ file, reasons }] }. */
function resolve({ project = process.cwd(), home = os.homedir() } = {}) {
  const refused = [];
  for (const file of [path.join(project, '.trouble', 'voices.yaml'), path.join(home, '.trouble', 'voices.yaml')]) {
    if (!fs.existsSync(file)) continue;
    const got = load(file);
    if (got.ok) return { roles: got.roles, source: file, refused };
    refused.push({ file, reasons: got.reasons });
    // A refused project file falls back to the defaults, not to the next file:
    // the user asked for those names, so say why they are not used.
    break;
  }
  return { roles: defaults(), source: 'defaults', refused };
}

function format(roles) {
  return ['voices:', ...IDS.map((id) => `  ${id}: {who: ${JSON.stringify(roles[id].who)}}`)].join('\n');
}

function main(argv) {
  const [command, ...rest] = argv;
  const flag = (name) => {
    const at = rest.indexOf(`--${name}`);
    return at === -1 ? undefined : rest[at + 1];
  };
  if (command === 'check') {
    const file = rest[0];
    if (!file) {
      process.stderr.write('usage: voices.js check FILE\n');
      return 2;
    }
    const got = load(file);
    if (got.ok) {
      process.stdout.write(`ok: ${file}\n${format(got.roles)}\n`);
      return 0;
    }
    process.stderr.write(`refused: ${file}\n${got.reasons.map((r) => `  - ${r}`).join('\n')}\n/trouble uses the default names instead.\n`);
    return 1;
  }
  if (command === 'resolve') {
    const result = resolve({ project: flag('project') || process.cwd(), home: flag('home') || process.env.HOME || process.env.USERPROFILE || os.homedir() });
    for (const r of result.refused) {
      process.stdout.write(`refused: ${r.file}\n${r.reasons.map((x) => `  - ${x}`).join('\n')}\n`);
    }
    process.stdout.write(`source: ${result.source}\n${format(result.roles)}\n`);
    return 0;
  }
  const help = command === '--help' || command === '-h' || command === '-help';
  (help ? process.stdout : process.stderr).write('usage: voices.js resolve [--project DIR] [--home DIR]\n       voices.js check FILE\n');
  return help ? 0 : 2;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { DEFAULT_FILE, IDS, defaults, format, load, main, parse, problems, resolve };
