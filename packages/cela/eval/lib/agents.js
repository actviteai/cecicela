'use strict';

/**
 * Agent adapters. Each returns a spec for one headless run: the command,
 * its arguments, and a parser that turns the captured stdout into
 * { final, turns, tokensIn, tokensOut, costUsd, error }.
 */

const fs = require('fs');
const path = require('path');

// Variables a parent Claude Code session sets. A nested run must not inherit them.
const PARENT_SESSION_VARS = [
  'CLAUDECODE',
  'CLAUDE_CODE_CHILD_SESSION',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_CODE_SESSION_ID',
  'CLAUDE_CODE_MESSAGING_SOCKET',
  'CLAUDE_CODE_MESSAGING_TOKEN',
  'CLAUDE_CODE_SESSION_ATTENDED',
  'CLAUDE_PID',
];

function cleanEnv(extra) {
  const env = { ...process.env, ...extra };
  for (const key of PARENT_SESSION_VARS) delete env[key];
  return env;
}

// The agent may read, edit, and run node, npm test, and git inside its scratch repo. Nothing else is allowed.
const CLAUDE_TOOLS = ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash(node:*)', 'Bash(npm test:*)', 'Bash(npm run:*)', 'Bash(git:*)', 'Bash(ls:*)'];

// The eval measures both protocol versions. 1.x playbooks are numbered
// (playbooks/01-discover.md); 2.x playbooks are named (discover.md, audit.md, git.md).
const PLAYBOOK = /playbooks\/(?:\d\d-)?[\w-]+\.md/g;
// Task state written by hand. 1.x agents kept .cela/state/*.md themselves. In 2.x the
// tool owns .cela/ (state.jsonl, oracles.json), so any hand edit there is a protocol violation.
const STATE_FILE = /\.cela\/(?:state\/|state\.jsonl$|oracles\.json$)/;
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);

function toolSummary(events) {
  const calls = [];
  for (const event of events) {
    if (event.type !== 'assistant' || !event.message || !Array.isArray(event.message.content)) continue;
    for (const item of event.message.content) {
      if (item.type === 'tool_use') calls.push({ name: item.name, input: item.input || {} });
    }
  }
  const touched = (c) => JSON.stringify(c.input);
  return {
    toolCalls: calls.length,
    skillRead: calls.some((c) => /cela\/SKILL\.md/.test(touched(c))),
    playbooksRead: [...new Set(calls.flatMap((c) => touched(c).match(PLAYBOOK) || []))].sort(),
    stateWrites: calls.filter((c) => WRITE_TOOLS.has(c.name) && STATE_FILE.test(String(c.input.file_path || '').replace(/\\/g, '/'))).length,
    engineCalls: calls.filter((c) => c.name === 'Bash' && /cela(\.js)?\s+(start|plan|req|cover|check|gate|claim|note|state|outcome|memory|protocol)\b/.test(String(c.input.command || ''))).length,
  };
}

function claude(model, { budgetUsd }) {
  return {
    name: `claude:${model}`,
    build(prompt) {
      const args = [
        '-p', prompt,
        '--output-format', 'stream-json',
        '--verbose',
        '--model', model,
        // Project settings only: the user's own plugins, hooks, and memory stay out of the run.
        '--setting-sources', 'project',
        '--permission-mode', 'acceptEdits',
        '--allowedTools', ...CLAUDE_TOOLS,
      ];
      if (budgetUsd) args.push('--max-budget-usd', String(budgetUsd));
      return { command: 'claude', args };
    },
    parse(stdout) {
      const events = [];
      for (const line of stdout.split('\n')) {
        try {
          events.push(JSON.parse(line));
        } catch {
          // stream-json is one event per line; skip partial lines
        }
      }
      const data = events.filter((e) => e.type === 'result').pop();
      if (!data) return { final: '', error: 'no result event in claude output', ...toolSummary(events) };
      const usage = data.usage || {};
      return {
        final: String(data.result || ''),
        turns: data.num_turns ?? null,
        tokensIn: (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0),
        tokensOut: usage.output_tokens || 0,
        costUsd: data.total_cost_usd ?? null,
        error: data.is_error ? String(data.subtype || data.result || 'error') : null,
        ...toolSummary(events),
      };
    },
  };
}

function codex(model) {
  return {
    name: `codex:${model || 'default'}`,
    build(prompt, workdir) {
      const last = path.join(workdir, '..', 'codex-last.txt');
      const args = ['exec', '--json', '--ephemeral', '--skip-git-repo-check', '-s', 'workspace-write', '-C', workdir, '-o', last];
      if (model) args.push('-m', model);
      args.push(prompt);
      return { command: 'codex', args, lastMessageFile: last };
    },
    parse(stdout, spec) {
      let tokensIn = 0;
      let tokensOut = 0;
      let turns = 0;
      let error = null;
      for (const line of stdout.split('\n')) {
        let event;
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }
        if (event.type === 'turn.completed') {
          turns += 1;
          tokensIn += (event.usage && event.usage.input_tokens) || 0;
          tokensOut += (event.usage && event.usage.output_tokens) || 0;
        }
        if (event.type === 'turn.failed' || event.type === 'error') {
          error = (event.error && event.error.message) || event.message || 'codex error';
        }
      }
      let final = '';
      try {
        final = fs.readFileSync(spec.lastMessageFile, 'utf8');
      } catch {
        final = '';
      }
      return { final, turns, tokensIn, tokensOut, costUsd: null, error };
    },
  };
}

function resolveAgent(id, options) {
  const [kind, ...rest] = id.split(':');
  const model = rest.join(':');
  if (kind === 'claude') return claude(model || 'claude-sonnet-5-5', options);
  if (kind === 'codex') return codex(model);
  throw new Error(`unknown agent: ${id} (use claude:<model> or codex[:<model>])`);
}

module.exports = { cleanEnv, resolveAgent, toolSummary };
