# chat/pack (generated)

The host-agnostic ceciCela chat pack, rendered by `npm run chat:build` from `chat/src/` and the CLI skills in `packages/`. Do not edit it here.

- `INSTRUCTIONS.md`: the router, for the Project's instructions slot.
- `knowledge/`: the three protocols (`ceci.chat.md`, `cela.chat.md`, `trouble.chat.md`), the help page (`help.md`), the drawing rules, the default role names, an example `state.md`, and worked examples.
- `graph-player.html`: the 80x24 player; the model emits it once per conversation and appends event lines after that.

Per-host kits with setup steps: `chat/claude/`, `chat/chatgpt/`, `chat/grok/`, `chat/m365/`.
