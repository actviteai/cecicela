# ceciCela

ceciCela: ceci plans this, cela proves that, trouble fixes what breaks. The /ceci job graph with human gates, the /cela evidence gate where a tool names the result, and the /trouble four-roles debug protocol, in one plugin.

## Skills

- `/cecicela` is the front door: it says which of the three skills fits your task and hands off.
- `/ceci` turns a goal into a job graph, runs ready jobs in dependency order, and stops at a human gate before anything that contacts someone, posts, pays, or sets a price.
- `/cela` is the evidence gate. A bundled tool runs your checks and names the result (COMPLETE, STALLED, BLOCKED, MISSING_TEST), so the model never grades its own work.
- `/trouble` is a four-roles debug protocol: collect verbatim evidence, rank hypotheses, and hold the fix until every role agrees.

## Install

In Claude Code:

```
/plugin install cecicela --marketplace actviteai/cecicela
```

In claude.ai, the desktop app, or Cowork, add it from **Customize > Plugins**.

## What ceci asks when it starts

Before it plans, ceci reads the job folder (`ceci prep`, which changes nothing) and asks up to four questions in one go:

1. **Plan**, when an older plan is there: resume it, start a new one and archive the old one into `runs/` (nothing is deleted), or start a new one in another folder. `--resume`, `--fresh`, or `--new-dir PATH` answers it.
2. **Brief**, when a brief is there: keep its rules, or edit them before any job starts.
3. **Animation**: the job graph live in this chat, in your terminal (`ceci status --watch`), or not at all. `--animate chat|terminal|off` answers it.
4. **Approach**, for a new plan: compare the options first, or name the approach yourself.

With nobody there to answer, ceci archives the old plan, keeps the brief, turns the animation off, and says so in its first line.

## What runs on your machine

This plugin has no hooks and no MCP servers, and nothing in it opens a network connection or sends data anywhere. Everything below runs only when Claude follows a skill and you allow the command.

- **ceci** (`skills/ceci/tool/ceci.js`, Node.js) reads and writes `brief.md`, `state.md` and `log.md` in the job folder you name, and draws the job graph in the terminal. `ceci archive` moves an old plan and its artifacts into `runs/` in that folder and deletes nothing; `ceci player` writes one HTML file, the graph player, with everything inlined. Neither opens a network connection.
- **cela** (`skills/cela/tool/cela.js`, Node.js) runs the test and check commands you agree on for the task, reads `git diff` and `git status`, and records the results in `.cela/` inside your repository. Its memory lives in `$CELA_HOME` (default `~/.cela`). `skills/cela/install/` holds optional scripts that copy the skill into `$CELA_HOME`; nothing runs them automatically.
- **trouble** (`skills/trouble/tool/voices.js`, Node.js) reads `voices.default.yaml`, or your own roles file, to name the four debug roles. It writes nothing.

## Links

- Source, issues and docs: https://github.com/actviteai/cecicela
- Publisher: actvite, https://actvite.com

## License

GPL-3.0-or-later. See `LICENSE`.
