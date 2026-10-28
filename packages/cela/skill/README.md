# cela Skill v1.2.0

`SKILL.md` is the instruction source. This README is not a second copy of the protocol.

**Research-Driven Adaptive Planning with Quality Gates**

cela is an evidence-first protocol for AI coding agents. The model plans the change; `tool/cela.js` runs the checks and names the result.

## Layout

```text
skill/
├── SKILL.md            # the protocol, loaded on every /cela run (~1.5k tokens)
├── tool/cela.js       # the engine: start, plan, req, cover, check, gate, claim, note, state, outcome, memory, export, protocol, hook-stop
├── playbooks/
│   ├── discover.md     # full depth, before start
│   ├── audit.md        # full depth or /cela audit, before reporting
│   └── git.md          # only when asked to commit, push, or use a worktree
└── install/            # skill-local installers for Unix and Windows
```

## Files the tool writes

```text
<repo>/.cela/oracles.json      # what "done" means: risk, task, requirements, files, commands
<repo>/.cela/state.jsonl       # append-only task log: start, plan, req, cover, check, gate, claim, note, stop, outcome
<repo>/.cela/rounds/<n>.patch  # the exact diff each check round measured
<repo>/.cela/archive/<time>/   # the previous task, moved whole by the next start
<repo>/.cela/depth             # optional default depth for this repo ("full")

$CELA_HOME/memory/records.jsonl          # global memory, one record per line
$CELA_HOME/projects/<id>/records.jsonl   # project memory
```

The model never reads the task files; only the tool does. That is why they can hold the full patch and every timing at no token cost, while the model sees a few lines per command.

`CELA_HOME` defaults to `~/.cela` (`%USERPROFILE%\.cela` on Windows).

## Slash commands

```text
/cela <task>
/cela depth full <task>
/cela status
/cela audit
/cela memory <terms>
```

## Requirements

Node.js 22 or newer on the agent's PATH. The tool has no dependencies.
