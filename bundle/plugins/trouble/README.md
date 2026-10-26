# /trouble

> ceci plans this, cela proves that, trouble fixes what breaks.

Stop looping on a bug you cannot close. /trouble is a four-roles debug protocol that collects verbatim evidence, ranks hypotheses with Bayesian math, and refuses a fix until the roles unanimously agree. Part of ceciCela.

## Skills

- `/trouble` is a four-roles debug protocol: collect verbatim evidence, rank hypotheses, and hold the fix until every role agrees.

## Install

In Claude Code:

```
/plugin install trouble --marketplace actviteai/cecicela
```

In claude.ai, the desktop app, or Cowork, add it from **Customize > Plugins**.

## What runs on your machine

This plugin has no hooks and no MCP servers, and nothing in it opens a network connection or sends data anywhere. Everything below runs only when Claude follows a skill and you allow the command.

- **trouble** (`skills/trouble/tool/voices.js`, Node.js) reads `voices.default.yaml`, or your own roles file, to name the four debug roles. It writes nothing.

## Links

- Source, issues and docs: https://github.com/actviteai/cecicela
- Publisher: actvite, https://actvite.com

## License

GPL-3.0-or-later. See `LICENSE`.
