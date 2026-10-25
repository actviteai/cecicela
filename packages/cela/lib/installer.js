'use strict';

/**
 * cela installer: the `cela install | init | status` commands.
 *
 * The harness table and the file-safety primitives come from the shared core
 * (lib/core, generated from packages/core). What stays here is cela's own:
 * the core home ($CELA_HOME, default ~/.cela) that holds memory and the
 * engine NeMo runs, the Claude Code slash-command bridge, the project
 * bridges `init` writes, the Claude Code Stop hook, and the NeMo guidance.
 *
 * Skill trees are staged and renamed into place. Personal harness files are
 * never replaced unless --force is set.
 */

const fs = require('fs');
const path = require('path');
const core = require('./core');
const hermes = require('./hermes');

const { copyTreeSafe, exists, publishTree, assertRegularFile, describePlace } = core.fsx;

const NAME = 'cela';
const TAG = 'cela';
// Framework integrations, not chat harnesses: install --nemo writes only the
// core and prints the pip and workflow setup. It never changes a Python
// environment, and --all leaves it out.
const FRAMEWORKS = new Set(['nemo']);
const HARNESS_IDS = [...core.harness.IDS, 'nemo'];
const COMMANDS = new Set(['install', 'init', 'status']);
// Task commands are handled by the engine that ships inside the skill tree.
const ENGINE_COMMANDS = new Set(['start', 'plan', 'req', 'cover', 'check', 'gate', 'claim', 'note', 'state', 'outcome', 'memory', 'export', 'protocol', 'hook-stop']);
const STOP_HOOK = {
  hooks: {
    Stop: [{ hooks: [{ type: 'command', command: 'node "$CLAUDE_PROJECT_DIR/.agents/skills/cela/tool/cela.js" hook-stop' }] }],
  },
};

function say(stream, message) {
  const text = String(message);
  stream(text.endsWith('\n') ? text : `${text}\n`);
}

function readVersion(pkgRoot) {
  const pkg = JSON.parse(fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf8'));
  if (!pkg.version || typeof pkg.version !== 'string') throw new Error('package.json is missing a version');
  return pkg.version;
}

/** The core harness homes plus cela's own home. */
function resolveLayout(env, platform = process.platform) {
  const homes = core.harness.homes(env, platform);
  return { ...homes, cela: env.CELA_HOME || path.join(homes.home, '.cela') };
}

function skillSource(pkgRoot) {
  const src = path.join(pkgRoot, 'skill');
  if (!exists(path.join(src, 'SKILL.md'))) {
    throw new Error(`cela skill source is missing (${src}). Install from a full checkout or via npx @actvite/cela.`);
  }
  return src;
}

function placeConfigFile(src, dest, options = {}) {
  return core.fsx.placeConfigFile(src, dest, { ...options, tag: TAG });
}

/**
 * A global bridge is read outside any repository, where the packaged
 * repo-relative fallback does not exist. Point it at the installed core.
 */
function globalBridge(layout) {
  const skill = path.join(layout.cela, 'skills', NAME, 'SKILL.md');
  return (text) => text.replace(/^Fallback: .*$/m, `Fallback: \`${skill}\``);
}

/**
 * Merge the cela Stop hook into .claude/settings.json. Other settings and
 * hooks are kept; the previous file is saved as settings.json.cela-backup.
 * A file that is not valid JSON is left alone and gets a sidecar instead.
 */
function addStopHook(dest, force) {
  const fresh = `${JSON.stringify(STOP_HOOK, null, 2)}\n`;
  if (!exists(dest)) return placeConfigFile(null, dest, { force, content: fresh });
  assertRegularFile(dest, dest);
  const current = fs.readFileSync(dest, 'utf8');
  let settings;
  try {
    settings = JSON.parse(current);
  } catch {
    return placeConfigFile(null, dest, { force, content: fresh });
  }
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return placeConfigFile(null, dest, { force, content: fresh });
  }
  const ours = STOP_HOOK.hooks.Stop[0].hooks[0].command;
  const stop = (settings.hooks && Array.isArray(settings.hooks.Stop)) ? settings.hooks.Stop : [];
  if (stop.some((entry) => (entry.hooks || []).some((h) => h.command === ours))) return { action: 'unchanged', dest };
  const backup = `${dest}.${TAG}-backup`;
  assertRegularFile(backup, backup);
  fs.writeFileSync(backup, current);
  settings.hooks = { ...(settings.hooks || {}), Stop: [...stop, STOP_HOOK.hooks.Stop[0]] };
  fs.writeFileSync(dest, `${JSON.stringify(settings, null, 2)}\n`);
  return { action: 'merged', dest, backup };
}

const CLAUDE_COMMAND = path.join('bridges', 'claude', 'commands', 'cela.md');
const PROJECT_BRIDGE = path.join('bridges', 'project.md');

/** Global files a harness gets besides its skill tree. Only Claude Code has one: the /cela command. */
function harnessFiles(id, layout, pkgRoot) {
  if (id === 'claude') return [[path.join(pkgRoot, CLAUDE_COMMAND), path.join(layout.claude, 'commands', 'cela.md')]];
  return [];
}

function harnessLabel(id) {
  if (id === 'nemo') return 'NVIDIA NeMo Agent Toolkit';
  return core.harness.byId(id).label;
}

function harnessTreeDests(id, layout) {
  if (FRAMEWORKS.has(id)) return [];
  return core.harness.skillDests(id, layout, NAME);
}

/** Hermes gets its own frontmatter; every other harness gets SKILL.md as packaged. */
function skillRender(id, version) {
  if (id === 'hermes') return (text) => hermes.renderInstalled(text, version);
  return undefined;
}

// [where init writes it, packaged source]. Every bridge but the Claude command
// is bridges/project.md, byte for byte.
const REPO_BRIDGES = [
  ['AGENTS.md', PROJECT_BRIDGE],
  ['CLAUDE.md', PROJECT_BRIDGE],
  ['GEMINI.md', PROJECT_BRIDGE],
  [path.join('.clinerules', 'cela.md'), PROJECT_BRIDGE],
  ['.goosehints', PROJECT_BRIDGE],
  [path.join('.grok', 'rules.md'), PROJECT_BRIDGE],
  [path.join('.github', 'copilot-instructions.md'), PROJECT_BRIDGE],
  [path.join('.claude', 'commands', 'cela.md'), CLAUDE_COMMAND],
];

function statusRows(layout) {
  return [
    ['Core Protocol ($CELA_HOME)', path.join(layout.cela, 'skills', NAME, 'SKILL.md')],
    ...core.harness.HARNESSES.map((h) => [h.label, path.join(core.harness.skillDests(h.id, layout, NAME)[0], 'SKILL.md')]),
  ];
}

function parseArgs(argv) {
  const flags = { help: false, version: false, force: false, quiet: false, all: false, globalOnly: false, hook: false, repo: null, command: null, harnesses: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') flags.help = true;
    else if (arg === '--version' || arg === '-v') flags.version = true;
    else if (arg === '--force') flags.force = true;
    else if (arg === '--quiet') flags.quiet = true;
    else if (arg === '--all') flags.all = true;
    else if (arg === '--global-only') flags.globalOnly = true;
    else if (arg === '--hook') flags.hook = true;
    else if (arg === '--repo') {
      const value = argv[i + 1];
      if (!value || value.startsWith('-')) throw new Error('--repo requires a directory path');
      i += 1;
      flags.repo = value;
    } else if (arg.startsWith('--') && HARNESS_IDS.includes(arg.slice(2))) {
      const id = arg.slice(2);
      if (!flags.harnesses.includes(id)) flags.harnesses.push(id);
    } else if (COMMANDS.has(arg)) {
      if (flags.command) throw new Error(`multiple commands: ${flags.command} and ${arg}`);
      flags.command = arg;
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
  }
  return flags;
}

function helpText(version) {
  const rows = core.harness.HARNESSES.map((h) => `  --${h.id.padEnd(15)}Install for ${h.label}`).join('\n');
  return `Usage: cela [COMMAND] [OPTIONS]
       npx @actvite/cela [COMMAND] [OPTIONS]

cela: the evidence gate of ceciCela (v${version})

Commands:
  install          Install the core skill and harness bridges (default)
  init             Write workspace bridges into the current repository
  status           Show install status for every harness

Task commands (run inside a repository; see SKILL.md):
  start, plan, req, cover, check, gate, claim, note, state, memory, export, protocol, hook-stop
  e.g. cela start --risk LOW --files src/a.js --run "npm test"; cela check; cela gate

Options:
  --all            Install every chat harness (default when none are named)
${rows}
  --nemo           NVIDIA NeMo Agent Toolkit: install the core engine and print
                   the pip and workflow setup (no Python environment is changed)
  --repo PATH      Write workspace bridges into PATH
  --hook           With init: add the Claude Code Stop hook to .claude/settings.json
  --global-only    Install only ~/.cela (or $CELA_HOME)
  --force          Replace existing harness files (keeps a .cela-backup)
  --quiet          Suppress the banner and per-file chatter
  --help, -h       Show this help message
  --version, -v    Print the version

There is no separate update command. Run install again with the same flags.
Skill trees are replaced after the new copy verifies. Edited harness files
are kept unless you pass --force.

Examples:
  npx @actvite/cela install --claude
  npx @actvite/cela install --cursor
  npx @actvite/cela install --hermes
  npx @actvite/cela@${version} install --all
  npx @actvite/cecicela install --all      # ceci, cela, and trouble together
  cela init
  cela init --force
  cela status
`;
}

function banner(version) {
  return `
               _
   ___ ___ | | __ _
  / __/ _ \\| |/ _\` |
 | (_|  __/| | (_| |
  \\___\\___||_|\\__,_|

 cela: a tool names the result (v${version})
`;
}

function installCore(pkgRoot, layout, log) {
  const src = skillSource(pkgRoot);
  log(`==> Setting up the cela core at: ${layout.cela}`);
  for (const sub of ['memory', 'projects', 'registry']) fs.mkdirSync(path.join(layout.cela, sub), { recursive: true });
  const dest = path.join(layout.cela, 'skills', NAME);
  publishTree(src, dest);
  log(`    + Core skill installed to ${dest}`);
}

function installHarness(id, pkgRoot, layout, force, log) {
  log(`==> Configuring for ${harnessLabel(id)}...`);
  const renderSkill = skillRender(id, readVersion(pkgRoot));
  for (const treeDest of harnessTreeDests(id, layout)) {
    publishTree(skillSource(pkgRoot), treeDest, { renderSkill });
    log(`    + skill tree installed to ${treeDest}`);
  }
  for (const [from, dest] of harnessFiles(id, layout, pkgRoot)) {
    log(describePlace(placeConfigFile(from, dest, { force, render: globalBridge(layout) })));
  }
  if (id === 'nemo') for (const line of nemoGuidance(layout)) log(line);
}

const NEMO_DOCS = 'https://github.com/actviteai/cecicela/tree/main/packages/cela/nemo';

/**
 * NeMo Agent Toolkit is a Python framework, not a chat harness: there is no
 * skills directory to write. The tools come from the cela-nat pip package,
 * which runs the engine installed in the core. PEP 668 environments refuse
 * an unasked pip install, so print the steps instead of running them.
 */
function nemoGuidance(layout) {
  const engine = path.join(layout.cela, 'skills', NAME, 'tool', 'cela.js');
  return [
    `    + engine for the cela function group: ${engine}`,
    '    i NeMo Agent Toolkit loads cela as a pip package. In the Python environment that runs `nat`:',
    '        git clone https://github.com/actviteai/cecicela.git',
    '        pip install "./cecicela/packages/cela/nemo[agents]"',
    '    i Then add the tools to your workflow YAML and use nemo/instructions.md as the system prompt:',
    '        function_groups:',
    '          cela: {_type: cela, repo_dir: /path/to/repo}',
    '        workflow:',
    '          tool_names: [cela]',
    `    i Full example: nemo/examples/workflow.yaml (${NEMO_DOCS})`,
  ];
}

/**
 * Best effort: can the Python on PATH import cela_nat? NeMo installs into a
 * virtual environment, so "not detected" may only mean a different Python.
 */
function nemoDetected(env) {
  const { spawnSync } = require('child_process');
  for (const python of process.platform === 'win32' ? ['python', 'py'] : ['python3', 'python']) {
    const probe = spawnSync(python, ['-c', 'import cela_nat'], { env, stdio: 'ignore', timeout: 15000, windowsHide: true });
    if (probe.error) continue;
    return { python, found: probe.status === 0 };
  }
  return { python: null, found: false };
}

function installRepo(pkgRoot, repoArg, cwd, force, log, hook) {
  const abs = path.resolve(cwd, repoArg);
  if (!exists(abs) || !fs.statSync(abs).isDirectory()) throw new Error(`directory does not exist: ${abs}`);
  log(`==> Installing cela workspace configuration into: ${abs}`);
  fs.mkdirSync(path.join(abs, '.cela'), { recursive: true });
  for (const [relDest, relSrc] of REPO_BRIDGES) {
    log(describePlace(placeConfigFile(path.join(pkgRoot, relSrc), path.join(abs, relDest), { force })));
  }
  for (const rel of [path.join('.agents', 'skills', NAME), path.join('.claude', 'skills', NAME)]) {
    const skillDest = path.join(abs, rel);
    publishTree(skillSource(pkgRoot), skillDest);
    log(`    + skill tree installed to ${skillDest}`);
  }
  if (hook) log(describePlace(addStopHook(path.join(abs, '.claude', 'settings.json'), force)));
  log('    + Workspace bridges processed for Codex, Grok, Copilot, Antigravity, Goose, Claude, and Cline.');
}

function printStatus(layout, log, env) {
  log('==> Inspecting cela install status:');
  for (const [name, target] of statusRows(layout)) {
    let installed = false;
    try {
      installed = fs.lstatSync(target).isFile();
    } catch {
      installed = false;
    }
    log(`  [${installed ? '✓' : '✗'}] ${name.padEnd(28)}: ${installed ? `Installed (${target})` : 'Not installed'}`);
  }
  const nemo = nemoDetected(env);
  let detail = 'Not detected (no python3 or python on PATH)';
  if (nemo.found) detail = `Installed (${nemo.python} can import cela_nat)`;
  else if (nemo.python) detail = `Not detected in ${nemo.python}; a virtual environment may have it (pip install ./packages/cela/nemo)`;
  log(`  [${nemo.found ? '✓' : '✗'}] ${harnessLabel('nemo').padEnd(28)}: ${detail}`);
}

function selectedHarnesses(flags) {
  if (flags.globalOnly) return [];
  if (flags.all || flags.harnesses.length === 0) {
    // --all means every chat harness; a framework named next to it still counts.
    const named = flags.harnesses.filter((id) => FRAMEWORKS.has(id));
    return [...HARNESS_IDS.filter((id) => !FRAMEWORKS.has(id)), ...named];
  }
  return flags.harnesses.slice();
}

/** For @actvite/cecicela: install the core and the named harnesses, quietly or with a log. */
function install({ harnesses, env = process.env, force = false, log = () => {}, pkgRoot = path.resolve(__dirname, '..') }) {
  const layout = resolveLayout(env);
  installCore(pkgRoot, layout, log);
  for (const id of harnesses) installHarness(id, pkgRoot, layout, force, log);
  return layout;
}

function runCli(argv, options = {}) {
  const pkgRoot = options.pkgRoot || path.resolve(__dirname, '..');
  const env = options.env || process.env;
  const cwd = options.cwd || process.cwd();
  const stdout = options.stdout || ((line) => process.stdout.write(line));
  const stderr = options.stderr || ((line) => process.stderr.write(line));
  const log = (message) => say(stdout, message);
  const error = (message) => say(stderr, message);
  const started = Date.now();

  if (ENGINE_COMMANDS.has(argv[0])) {
    const engine = require(path.join(skillSource(pkgRoot), 'tool', 'cela.js'));
    let stdin = options.stdin !== undefined ? options.stdin : '';
    if (options.stdin === undefined && argv[0] === 'hook-stop') {
      try {
        stdin = fs.readFileSync(0, 'utf8');
      } catch {
        stdin = '';
      }
    }
    return engine.main(argv, { cwd, env, stdin, out: (line) => stdout(`${line}\n`), err: (line) => stderr(`${line}\n`) });
  }

  try {
    const version = readVersion(pkgRoot);
    const flags = parseArgs(argv);
    if (flags.version) {
      log(version);
      return 0;
    }
    if (flags.help) {
      if (!flags.quiet) log(banner(version).replace(/^\n/, ''));
      log(helpText(version).replace(/\n$/, ''));
      return 0;
    }
    if (!flags.quiet) log(banner(version).replace(/^\n/, ''));

    const repoMode = Boolean(flags.repo) || flags.command === 'init';
    const harnessMode = flags.all || flags.globalOnly || flags.harnesses.length > 0;
    if (repoMode && harnessMode) throw new Error('init/--repo only writes workspace bridges. Run a separate install command for global harnesses.');
    if (flags.hook && !repoMode) throw new Error('--hook only applies to init / --repo');
    if (flags.globalOnly && (flags.all || flags.harnesses.length > 0)) throw new Error('--global-only cannot be combined with harness selectors or --all');
    if (flags.command === 'status' && (repoMode || harnessMode || flags.force)) throw new Error('status does not take install selectors');

    const layout = resolveLayout(env);
    const quiet = flags.quiet ? () => {} : log;

    if (flags.command === 'status') {
      printStatus(layout, log, env);
    } else if (repoMode) {
      installRepo(pkgRoot, flags.repo || cwd, cwd, flags.force, quiet, flags.hook);
    } else {
      installCore(pkgRoot, layout, quiet);
      const harnesses = selectedHarnesses(flags);
      for (const id of harnesses) installHarness(id, pkgRoot, layout, flags.force, quiet);
      if (harnesses.includes('hermes')) {
        quiet('    i Hermes registers the skill as /cela.');
      }
      if (!flags.quiet) {
        const frameworksOnly = harnesses.length > 0 && harnesses.every((id) => FRAMEWORKS.has(id));
        log(frameworksOnly
          ? '\n==> Installation complete. Add the cela function group to your workflow as shown above.'
          : "\n==> Installation complete. Invoke '/cela <task>' in your AI harness.");
      }
    }

    if (!flags.quiet) log(`==> Done in ${Date.now() - started}ms`);
    return 0;
  } catch (err) {
    error(`error: ${err.message}`);
    return 1;
  }
}

module.exports = {
  FRAMEWORKS,
  HARNESS_IDS,
  REPO_BRIDGES,
  copyTreeSafe,
  harnessFiles,
  harnessTreeDests,
  install,
  parseArgs,
  placeConfigFile,
  publishTree,
  readVersion,
  resolveLayout,
  runCli,
  statusRows,
};
