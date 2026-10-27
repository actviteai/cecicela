# @actvite/cecicela

> ceci plans this, cela proves that, trouble fixes what breaks.

Video: [ceciCela, explained](https://youtu.be/i5Ge36L_MTk) on the [actVite YouTube channel](https://www.youtube.com/channel/UCPlRHTUre-GPCK__77zI5IQ).

Installs the three ceciCela skills, and the `/cecicela` front door, into Claude Code, Grok, Codex, Cline, Goose, Cursor, GitHub Copilot, Google Antigravity, and Hermes Agent.

```bash
npx --yes @actvite/cecicela install --all
```

| Command | Does |
| --- | --- |
| `cecicela install [--all\|--<harness> ...] [--only ceci,cela,trouble] [--force]` | Installs the skills; with no harness named, all nine |
| `cecicela status` | Which skill is installed in which harness |
| `cecicela update` | Reinstalls into every harness that already has any of them |
| `cecicela --version` | The bundle version and the exact skill versions it carries |

Then restart the agent session and type `/ceci` (plan a goal as a job graph), `/cela` (prove a change with a tool-measured gate), or `/trouble` (debug what earlier attempts did not fix). Not sure which? `/cecicela` offers a start menu: start something new, review what the work dir and your agent's memory already hold, see every command (the help card), or improve your prompt before it runs. After each result it asks once how it landed (good, adjust, retry another way, or report a problem as a GitHub issue that you file), and `ceci feedback` keeps the answer with the plan. In Claude Code, plugin skills are namespaced: `/cecicela:ceci`, `/cecicela:cela`, `/cecicela:trouble`.

The skills come from their own packages, pinned exactly: [`@actvite/ceci`](https://www.npmjs.com/package/@actvite/ceci), [`@actvite/cela`](https://www.npmjs.com/package/@actvite/cela), and [`@actvite/trouble`](https://www.npmjs.com/package/@actvite/trouble). Docs, the plugin marketplace, and the chat versions: [github.com/actviteai/cecicela](https://github.com/actviteai/cecicela).

GPL-3.0-or-later.
