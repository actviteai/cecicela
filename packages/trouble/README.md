# /trouble — four-roles debug protocol for stuck incidents

**Stop guessing. Make the agent argue until the evidence wins.**

`/trouble` is an open-source **AI agent skill** for hard debugging: production incidents, debug loops, and "nothing I try is fixing this" bugs. The protocol the model executes is YAML in [`skill/SKILL.md`](skill/SKILL.md): ids defined once, no repeated prose.

trouble is part of **[ceciCela](https://github.com/actviteai/cecicela)**: *ceci plans this, cela proves that, trouble fixes what breaks.* It stands alone; the only link is a suggestion to run `/cela` on the fix it ships.

Four roles — **the keeper**, **the detective**, **the maintainer**, and **the physicist** — collect verbatim evidence, rank hypotheses with explicit **Bayesian** arithmetic, and **will not apply a fix until they unanimously agree**. Every run ends with a machine-parseable `TROUBLE_VERDICT_BEGIN` / `TROUBLE_VERDICT_END` block that pipelines can gate on.

If your coding agent patches first and thinks later, this is the protocol that slows it down on purpose.

## Why people install it

- **Root-cause analysis, not vibes.** Claims without a quoted log line, file, or command output are tagged unverified and cannot support a fix.
- **Incident response for agents.** Exit-code triage, MCP documentation survey, smuggled-assumption hunt, timeline / causality check.
- **A real agreement gate.** Each of the four roles votes yes/no with a 0–10 confidence score before any code change.
- **Names you choose.** The roles' names are yours to set (below); what each role does is the protocol and stays fixed.

## The four roles

| id | default name (`who:`) | what it does (fixed) |
| --- | --- | --- |
| `keeper` | the archivist | catalog facts, cite lines, syntax-perfect code, flag assumptions smuggled as facts, anchor on doc MCPs |
| `detective` | the detective | what cannot be true, what is missing, hyper-specific falsifiers, unverified assumptions are suspects |
| `maintainer` | the kernel maintainer | smallest diff, veto ceremony, veto a refactor when a one-line fix may exist, strike restated bugs |
| `physicist` | the physicist who specialises in time | time order, what could not influence what, entropy, races, pull toward the minimal test |

### Rename them

Copy [`skill/voices.default.yaml`](skill/voices.default.yaml) to `.trouble/voices.yaml` in a project (or `~/.trouble/voices.yaml` for every project) and change the `who:` lines:

```yaml
voices:
  keeper: {who: "The Librarian"}
  detective: {who: "The Inspector"}
  maintainer: {who: "The Gatekeeper"}
  physicist: {who: "The Timekeeper"}
```

Rules: exactly these four ids, no others, and only `who:` (one line, at most 80 characters). The cross-exams depend on the four ids, so a file that adds, drops, or renames a role, or tries to change `does:`, is refused with its reasons and `/trouble` uses the defaults. Check a file before you rely on it:

```bash
trouble voices check .trouble/voices.yaml      # or: node <skill dir>/tool/voices.js check FILE
trouble voices resolve                         # the names /trouble will use in this directory, and why
```

Lookup order in a coding agent: the project file, then the user file, then the defaults. In a chat (no files), paste a `voices:` block at the start of the conversation; it holds for that conversation only.

## Install

```bash
npx --yes @actvite/cecicela install --all    # ceci, cela, and trouble together
npx --yes @actvite/trouble install --all     # trouble alone, every harness
npx --yes @actvite/trouble install --claude --grok
```

`trouble install` writes the skill directory into each harness you name (default: all nine): Claude Code, Grok, Codex, Cline, Goose, Cursor, GitHub Copilot, Google Antigravity, and Hermes Agent. Restart the agent session after an install; a session that was already open will not see a skill added underneath it.

### Plugin marketplaces

The ceciCela repository is a marketplace for Claude Code, Grok, Copilot CLI, and Codex. It lists the bundle (`cecicela`) and each skill on its own, so you can install only `/trouble`:

```bash
claude plugin marketplace add actviteai/cecicela
claude plugin install trouble@cecicela

grok plugin marketplace add actviteai/cecicela
grok plugin install trouble --trust

copilot plugin marketplace add actviteai/cecicela
copilot plugin install trouble@cecicela

codex plugin marketplace add actviteai/cecicela
```

In Claude Code a plugin's skills are namespaced by the plugin: the full command is `/trouble:trouble` (or `/cecicela:trouble` from the bundle); `/trouble` works when no other installed skill claims the name.

### Claude

Claude (claude.ai), not Claude Code, has no git marketplace. Upload a zip of
the skill folder.

1. Enable **Code execution and file creation** (Skills stay off without it).
2. Zip the skill as a folder named `trouble`, so the folder name matches the skill name:

```bash
cd cecicela/packages/trouble
cp -R skill trouble && zip -r trouble.zip trouble && rm -rf trouble
```

3. Settings → Capabilities → Skills → **Upload skill**, and upload
   `trouble.zip`.
4. Toggle the skill on. Custom uploads are private to that account.

Organization owners can provision the same zip for everyone: Organization
settings → Plugins & skills → Add → Upload a skill. Those also load in Claude
Code for users who sign in with that Claude account, unless
`syncClaudeAiSkills` is `false` in Claude Code managed settings.

### Hermes Agent

```bash
npx --yes @actvite/trouble install --hermes
```

That writes `~/.hermes/skills/software-development/trouble/` (Windows: `%LOCALAPPDATA%\hermes`). Or install from the repository with the Hermes hub, whose identifier is `owner/repo/path-to-skill-dir`:

```bash
hermes skills install actviteai/cecicela/bundle/hermes/trouble --category software-development --yes
```

Slash command is `/trouble`. In the desktop app, run `/reload-skills` or restart.

### DeepSeek Harness

DeepSeek Harness has **no** git marketplace catalog analogous to
`.grok-plugin/marketplace.json` or `.claude-plugin/marketplace.json`. Do not
look for `.deepseek-plugin/marketplace.json` — that file is not a DSH
interface. DSH discovers `SKILL.md` by copying the skill bundle into a skill
root (or via `npx skills add` when you want a generic Agent Skills installer).

The skills CLI has no DeepSeek agent. Copy the shipped skill directory:

```bash
mkdir -p ~/.dsh/skills ~/.agents/skills
cp -R "$SKILL" ~/.dsh/skills/trouble
cp -R "$SKILL" ~/.agents/skills/trouble
```

Project-local (highest precedence is `.dsh/skills`):

```bash
mkdir -p .dsh/skills .agents/skills
cp -R "$SKILL" .dsh/skills/trouble
```

Optional Agent Skills CLI (not a DSH marketplace):

```bash
npx skills add actviteai/cecicela --skill trouble --full-depth
```

If that installer does not find the nested `SKILL.md`, use the copy commands
above. Restart the DSH session and invoke `/trouble`.

### OpenCode

OpenCode reads `.opencode/skills/<name>/SKILL.md`,
`~/.config/opencode/skills/<name>/SKILL.md`, and the Claude and `.agents`
skill directories. `metadata.opencode/slash` is `"true"` in this skill, so
`/trouble` is a TUI command.

```bash
npx skills add actviteai/cecicela --skill trouble --full-depth -a opencode -g
```

That writes `~/.config/opencode/skills/trouble/`. Copy equivalent:

```bash
mkdir -p ~/.config/opencode/skills
cp -R "$SKILL" ~/.config/opencode/skills/trouble
```

Project-local: `.opencode/skills/trouble/`. Start a new session after install.

### NeMo Agent Toolkit

NeMo does not load `SKILL.md`. It is a workflow framework. Any string field
accepts `file://`, resolved from the workflow file's directory. Allowed
extensions include `.md` (also `.txt`, `.prompt`, `.j2`, `.jinja`, `.tpl`,
`.template`).

`tool_calling_agent` can take the protocol as its system prompt:

```yaml
workflow:
  _type: tool_calling_agent
  llm_name: nim_llm
  tool_names: []  # your tools
  system_prompt: file://packages/trouble/skill/SKILL.md
```

`react_agent` is different. In nvidia-nat-langchain 1.8.0, a set
`system_prompt` replaces the default prompt, and the joined
`system_prompt` + `additional_instructions` must still contain `{tools}` and
`{tool_names}` or `nat` raises `Invalid system_prompt`. Leave `system_prompt`
unset and attach the protocol here:

```yaml
workflow:
  _type: react_agent
  llm_name: nim_llm
  tool_names: []  # your tools
  additional_instructions: file://packages/trouble/skill/SKILL.md
```

Adjust the `file://` path so it is relative to the workflow file, or use an
absolute path. There is no NeMo plugin package in this repo: the protocol has
no engine to wrap.

## Use

- Slash command: `/trouble`
- Skills menu: `/skills trouble`
- Triggers: "troubleshoot", "debug this", "root cause", "incident response", "let's Bayesian this", "we need the four minds", or a problem that has already been worked on unsuccessfully

The agent must announce **Using the four-minds debug protocol** and follow `order` in `SKILL.md`.

### In a chat, without tools

trouble's `untooled` mode is the lead chat product of ceciCela. With prompt text only, it skips phases 0 and 1, does not pretend to read files or run commands, caps every score at 6, and always ends `INCIDENT_RESOLVED: no`; what it hands back is evidence requests and a proposed fix with the one command that would verify it. See the [ceciCela chat packs](https://github.com/actviteai/cecicela/tree/main/chat).

## What you get

```text
packages/trouble/
├── bin/trouble.js               # install, status, voices
├── lib/skill.js                 # install through the shared core; used by @actvite/cecicela
├── lib/core/                    # generated copy of packages/core
└── skill/
    ├── SKILL.md                 # YAML protocol the model executes
    ├── voices.default.yaml      # the four default role names
    └── tool/voices.js           # finds and validates voices.yaml (zero dependencies)
```

## Uninstall

Delete the `trouble/` directory under each harness's skills path, or uninstall the marketplace plugin (`claude plugin uninstall trouble@cecicela`, `grok plugin uninstall trouble --confirm`, `copilot plugin uninstall trouble`). Claude uploads are removed in Settings → Skills.

## Validate (maintainers)

```bash
npm test --workspace @actvite/trouble   # structure, voices, install, npm files
npm test                                # the whole repository
```

## License

[GNU General Public License v3.0 or later](LICENSE) (GPLv3).

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
