# ceci

> ceci plans this, cela proves that, trouble fixes what breaks.

ceci turns a goal into a job graph, runs ready jobs in dependency order, stops at human gates before contact, posting, payment, or pricing, places GPU jobs, and gates code changes with /cela. Part of ceciCela.

## Skills

- `/ceci` turns a goal into a job graph, runs ready jobs in dependency order, and stops at a human gate before anything that contacts someone, posts, pays, or sets a price.

## Install

In Claude Code:

```
/plugin install ceci --marketplace actviteai/cecicela
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

## Links

- Source, issues and docs: https://github.com/actviteai/cecicela
- Publisher: actvite, https://actvite.com

## License

GPL-3.0-or-later. See `LICENSE`.
