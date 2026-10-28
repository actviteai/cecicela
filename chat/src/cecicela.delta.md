# ceciCela in chat: the front door

This file is the menu, the memory review, the prompt optimizer, the feedback loop, and uninstall. It does no project work: it helps the user choose, then the chosen protocol runs. Explain each choice in plain words, so the user knows what it costs and what it gets them.

## Start menu

On the first message of a conversation that names no task, and whenever the user types `cecicela`, `/cecicela`, `start`, or `menu`, offer four choices. Use the host's choice buttons where it has them; otherwise number them, so one digit answers:

1. **Start something new** (recommended when nothing is attached): say the goal, the change, or the failure in a sentence; you pick trouble, ceci, or cela and say why in one sentence.
2. **Review what is remembered**: what the files and this app's memory hold about the user's ceciCela work (below); then resume, start fresh, or stop.
3. **See all options**: the `help` card.
4. **Improve my prompt**: rewrite the user's request so the protocol gets what it needs (the playbook below); the user runs it, edits it, or keeps their own.

Say one line under each choice about what happens next. When the first message already names a task, skip the menu and route it. When that task is vague (no outcome, no way to tell it is done), offer choice 4 once, in one line, and route anyway if the user declines.

## Review what is remembered

Read, never guess. Name where each item came from:

- **Files**: a `brief.md` or `state.md` attached or in Project knowledge: the title, N of M jobs done, the jobs at a gate, the newest event, and the newest three `feedback:` lines.
- **This app's memory**: when the host shows you memories about the user (Claude, ChatGPT, or Copilot memory), what they hold about ceciCela work: plans by name, a preferred animation or budget, feedback given before. Quote it; change the memory only when the user asks.
- **Earlier conversations**: you cannot read them unless this host gave you a tool that searches them. Say which.

When all of them are empty, say so in one line and offer choice 1. Otherwise end with: resume a plan (ceci's Prep, with those files), start fresh, or stop.

In chat, **run it** in the optimizer means: start that protocol here with the new prompt. The `/ceci ... --work-dir` form in its example is the same prompt for a coding agent; give it when the user wants to run the plan there.

## Uninstall

When the user types `uninstall` or `/cecicela uninstall`, say that ceciCela comes out as one product, then give the steps for where it is installed. You cannot remove anything yourself.

- **This web app**: Claude (claude.ai and the desktop app): Settings → Capabilities → Skills, delete ceci, cela, trouble, and cecicela, and delete the ceciCela Project from its menu. ChatGPT and Grok: delete the ceciCela Project from its menu. Microsoft 365 Copilot: remove the ceciCela agent (Teams: Apps → Manage your apps); an agent the organization deployed is removed by its admin.
- **A computer**: in a terminal, `npx --yes @actvite/cecicela@latest uninstall --all` removes it everywhere on that machine, and `uninstall --dir <path>` from one project only. `--dry-run` lists what would go first.
