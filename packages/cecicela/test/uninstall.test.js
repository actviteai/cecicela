'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const BIN = path.join(ROOT, 'bin', 'cecicela.js');
const CELA_BIN = path.join(ROOT, '..', 'cela', 'bin', 'cela.js');
const OVERRIDES = ['CLAUDE_HOME', 'GROK_HOME', 'CLINE_HOME', 'AGENTS_HOME', 'CURSOR_HOME', 'COPILOT_HOME', 'GEMINI_HOME', 'HERMES_HOME', 'CELA_HOME'];
const NAMES = ['ceci', 'cecicela', 'cela', 'trouble'];

/** A throwaway home with every harness override cleared, so nothing reaches the real one. */
function sandbox() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cecicela-uninstall-'));
  const env = { ...process.env, HOME: home, USERPROFILE: home, LOCALAPPDATA: path.join(home, 'AppData', 'Local') };
  for (const key of OVERRIDES) delete env[key];
  const run = (bin, args, opts = {}) => spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', env, ...opts });
  return { home, env, cecicela: (args, opts) => run(BIN, args, opts), cela: (args, opts) => run(CELA_BIN, args, opts) };
}

/** Every file under `dir`, relative, sorted. */
function files(dir) {
  const out = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else out.push(path.relative(dir, p).split(path.sep).join('/'));
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out.sort();
}

const skill = (dir, name) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: test\n---\n`);
};

test('uninstall --all removes ceciCela from every harness, the /cela command, the Copilot agent, and the cela engine', () => {
  const s = sandbox();
  assert.equal(s.cecicela(['install', '--all']).status, 0);
  skill(path.join(s.home, '.claude', 'skills', 'mine'), 'mine');
  const res = s.cecicela(['uninstall', '--all']);
  assert.equal(res.status, 0, res.stderr);
  for (const name of NAMES) {
    for (const dir of ['.claude/skills', '.grok/skills', '.agents/skills', '.cline/skills', '.cursor/skills', '.copilot/skills', '.gemini/antigravity-cli/skills', '.gemini/config/skills', '.hermes/skills/software-development']) {
      assert.equal(fs.existsSync(path.join(s.home, dir, name)), false, `${dir}/${name}`);
    }
  }
  for (const gone of ['.claude/commands/cela.md', '.copilot/agents/cecicela.agent.md', '.cela/skills']) assert.equal(fs.existsSync(path.join(s.home, gone)), false, gone);
  assert.match(res.stdout, /- removed .*cela\.md/);
  assert.match(res.stdout, /Removed \d+ item\(s\)\. Restart the agent session\./);
  assert.match(res.stdout, /claude plugin uninstall cecicela@cecicela/);
  assert.deepEqual(files(path.join(s.home, '.claude')), ['skills/mine/SKILL.md'], 'a skill that is not ceciCela\'s stays');
  assert.match(s.cecicela(['uninstall', '--all']).stdout, /Nothing of ceciCela was found there/);
});

test('uninstall --all keeps the cela memory home unless --purge', () => {
  const s = sandbox();
  assert.equal(s.cecicela(['install', '--claude']).status, 0);
  fs.writeFileSync(path.join(s.home, '.cela', 'memory', 'facts.jsonl'), '{}\n');
  const kept = s.cecicela(['uninstall', '--all']);
  assert.equal(kept.status, 0, kept.stderr);
  assert.match(kept.stdout, /The cela memory .* is kept; --purge deletes it/);
  assert.deepEqual(files(path.join(s.home, '.cela')), ['memory/facts.jsonl']);
  const purged = s.cecicela(['uninstall', '--all', '--purge']);
  assert.equal(purged.status, 0, purged.stderr);
  assert.equal(fs.existsSync(path.join(s.home, '.cela')), false);
});

test('uninstall --<harness> removes ceciCela from that harness only and keeps the cela core', () => {
  const s = sandbox();
  assert.equal(s.cecicela(['install', '--claude', '--grok']).status, 0);
  const res = s.cecicela(['uninstall', '--claude']);
  assert.equal(res.status, 0, res.stderr);
  assert.deepEqual(fs.readdirSync(path.join(s.home, '.claude', 'skills')), []);
  assert.equal(fs.existsSync(path.join(s.home, '.claude', 'commands', 'cela.md')), false);
  assert.deepEqual(fs.readdirSync(path.join(s.home, '.grok', 'skills')).sort(), NAMES);
  assert.ok(fs.existsSync(path.join(s.home, '.cela', 'skills', 'cela', 'SKILL.md')), 'the core stays for the other harnesses');
  assert.doesNotMatch(res.stdout, /grok plugin/);
});

test('uninstall --dir PATH removes what cela init wrote and keeps other settings and .cela unless --purge', () => {
  const s = sandbox();
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'cecicela-repo-'));
  fs.writeFileSync(path.join(repo, 'README.md'), 'mine\n');
  fs.writeFileSync(path.join(repo, 'GEMINI.md'), 'my own notes\n');
  fs.mkdirSync(path.join(repo, '.claude'));
  const other = { type: 'command', command: 'echo mine' };
  fs.writeFileSync(path.join(repo, '.claude', 'settings.json'), `${JSON.stringify({ model: 'x', hooks: { Stop: [{ hooks: [other] }] } }, null, 2)}\n`);
  assert.equal(s.cela(['init', '--hook'], { cwd: repo }).status, 0);
  skill(path.join(repo, '.claude', 'skills', 'trouble'), 'trouble');
  fs.writeFileSync(path.join(repo, '.cela', 'note.txt'), 'record\n');
  assert.ok(fs.existsSync(path.join(repo, 'GEMINI.md.cela')), 'init left a proposed copy beside the user file');

  const res = s.cecicela(['uninstall', '--dir', repo]);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /removed the cela Stop hook from .*settings\.json \(backup: /);
  assert.match(res.stdout, /\.cela\/ records are kept; --purge deletes them/);
  assert.doesNotMatch(res.stdout, /plugin uninstall/);
  const left = files(repo);
  // init's backup (the file before the hook) and uninstall's (the file with it) are both the user's.
  assert.deepEqual(left, ['.cela/note.txt', '.claude/settings.json', '.claude/settings.json.cela-backup', '.claude/settings.json.cela-backup-2', 'GEMINI.md', 'README.md']);
  assert.equal(fs.readFileSync(path.join(repo, 'GEMINI.md'), 'utf8'), 'my own notes\n');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(repo, '.claude', 'settings.json'), 'utf8')), { model: 'x', hooks: { Stop: [{ hooks: [other] }] } });

  const purged = s.cecicela(['uninstall', '--dir', repo, '--purge']);
  assert.equal(purged.status, 0, purged.stderr);
  assert.equal(fs.existsSync(path.join(repo, '.cela')), false);

  const only = fs.mkdtempSync(path.join(os.tmpdir(), 'cecicela-repo-'));
  assert.equal(s.cela(['init', '--hook'], { cwd: only }).status, 0);
  assert.equal(s.cecicela(['uninstall', `--dir=${only}`, '--purge']).status, 0);
  assert.deepEqual(files(only), [], 'a settings.json that held only the cela hook goes, and so does everything else init wrote');
});

test('a skill directory or file that is not ceciCela\'s is left alone and reported', () => {
  const s = sandbox();
  assert.equal(s.cecicela(['install', '--claude']).status, 0);
  const impostor = path.join(s.home, '.claude', 'skills', 'ceci');
  fs.rmSync(impostor, { recursive: true });
  skill(impostor, 'someone-elses-ceci');
  fs.writeFileSync(path.join(s.home, '.claude', 'commands', 'cela.md'), '# my own /cela command\n');
  const res = s.cecicela(['uninstall', '--claude']);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /! kept .*ceci \(its SKILL\.md does not name ceci\)/);
  assert.match(res.stdout, /! kept .*cela\.md \(not ceciCela's, or edited\)/);
  assert.match(res.stdout, /Kept 2 item\(s\)/);
  assert.deepEqual(fs.readdirSync(path.join(s.home, '.claude', 'skills')), ['ceci']);
  assert.equal(fs.readFileSync(path.join(s.home, '.claude', 'commands', 'cela.md'), 'utf8'), '# my own /cela command\n');
});

test('a symlinked skill directory is unlinked without touching its target', { skip: process.platform === 'win32' && 'symlinks need privileges on Windows' }, () => {
  const s = sandbox();
  const checkout = fs.mkdtempSync(path.join(os.tmpdir(), 'cecicela-checkout-'));
  skill(checkout, 'trouble');
  fs.mkdirSync(path.join(s.home, '.claude', 'skills'), { recursive: true });
  fs.symlinkSync(checkout, path.join(s.home, '.claude', 'skills', 'trouble'), 'dir');
  const res = s.cecicela(['uninstall', '--claude']);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /removed .*trouble \(link only\)/);
  assert.equal(fs.existsSync(path.join(s.home, '.claude', 'skills', 'trouble')), false);
  assert.deepEqual(files(checkout), ['SKILL.md'], 'the link target is untouched');
});

test('uninstall --web prints the steps for every web app and writes nothing', () => {
  const s = sandbox();
  const res = s.cecicela(['uninstall', '--web']);
  assert.equal(res.status, 0, res.stderr);
  for (const host of ['Claude', 'ChatGPT', 'Grok', 'Microsoft 365 Copilot']) assert.match(res.stdout, new RegExp(host));
  assert.match(res.stdout, /Settings → Capabilities → Skills/);
  assert.doesNotMatch(res.stdout, /Removed|Nothing of ceciCela/);
  assert.deepEqual(files(s.home), []);
});

test('uninstall --dry-run lists what would be removed and changes nothing', () => {
  const s = sandbox();
  assert.equal(s.cecicela(['install', '--all']).status, 0);
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'cecicela-repo-'));
  assert.equal(s.cela(['init', '--hook'], { cwd: repo }).status, 0);
  const before = [files(s.home), files(repo)];
  const res = s.cecicela(['uninstall', '--all', '--dir', repo, '--purge', '--dry-run']);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /- would remove /);
  assert.doesNotMatch(res.stdout, /- removed /);
  assert.match(res.stdout, /Would remove \d+ item\(s\); nothing changed/);
  assert.deepEqual([files(s.home), files(repo)], before);
});

test('uninstall with no target exits 2 naming the choices; a missing directory or an unknown option exits 1', () => {
  const s = sandbox();
  const bare = s.cecicela(['uninstall']);
  assert.equal(bare.status, 2);
  assert.match(bare.stderr, /--all .*--dir PATH .*--web/);
  const missing = s.cecicela(['uninstall', '--dir', path.join(s.home, 'nope')]);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /directory does not exist/);
  assert.equal(s.cecicela(['uninstall', '--dir']).status, 1);
  const bogus = s.cecicela(['uninstall', '--all', '--bogus']);
  assert.equal(bogus.status, 1);
  assert.match(bogus.stderr, /unknown option: --bogus/);
  assert.deepEqual(files(s.home), [], 'a refused uninstall touches nothing');
  assert.match(s.cecicela(['--help']).stdout, /cecicela uninstall --all \| --<harness> \.\.\. \| --dir PATH \| --web/);
});
