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

## What runs on your machine

This plugin has no hooks and no MCP servers, and nothing in it opens a network connection or sends data anywhere. Everything below runs only when Claude follows a skill and you allow the command.

- **ceci** (`skills/ceci/tool/ceci.js`, Node.js) reads and writes `brief.md`, `state.md` and `log.md` in the job folder you name, and draws the job graph in the terminal.

## Links

- Source, issues and docs: https://github.com/actviteai/cecicela
- Publisher: actvite, https://actvite.com

## License

GPL-3.0-or-later. See `LICENSE`.
