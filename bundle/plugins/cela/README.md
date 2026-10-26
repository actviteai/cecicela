# cela

> ceci plans this, cela proves that, trouble fixes what breaks.

cela is an evidence-first protocol for AI coding agents. A bundled tool runs the checks and names the result (COMPLETE, STALLED, BLOCKED, MISSING_TEST), so the model never grades its own work. Part of ceciCela.

## Skills

- `/cela` is the evidence gate. A bundled tool runs your checks and names the result (COMPLETE, STALLED, BLOCKED, MISSING_TEST), so the model never grades its own work.

## Install

In Claude Code:

```
/plugin install cela --marketplace actviteai/cecicela
```

In claude.ai, the desktop app, or Cowork, add it from **Customize > Plugins**.

## What runs on your machine

This plugin has no hooks and no MCP servers, and nothing in it opens a network connection or sends data anywhere. Everything below runs only when Claude follows a skill and you allow the command.

- **cela** (`skills/cela/tool/cela.js`, Node.js) runs the test and check commands you agree on for the task, reads `git diff` and `git status`, and records the results in `.cela/` inside your repository. Its memory lives in `$CELA_HOME` (default `~/.cela`). `skills/cela/install/` holds optional scripts that copy the skill into `$CELA_HOME`; nothing runs them automatically.

## Links

- Source, issues and docs: https://github.com/actviteai/cecicela
- Publisher: actvite, https://actvite.com

## License

GPL-3.0-or-later. See `LICENSE`.
