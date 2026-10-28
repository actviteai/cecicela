---
name: cecicela
description: Front door for ceciCela. Use on /cecicela, or when the user is unsure whether to plan a goal (ceci), prove a change (cela), or debug what broke (trouble). Offers a start menu, help, a review of what is remembered, prompt tuning, and feedback; names the skill that fits and hands off.
license: GPL-3.0-or-later
---
# ceciCela

ceci plans this, cela proves that, trouble fixes what breaks. This skill does no project work itself: it helps the user choose, then hands off. Keep every reply short, and explain each choice in plain words, so the user knows what each option costs and gets.

## Start menu

On `/cecicela` with nothing after it, or with a question about ceciCela itself ("what is this?", "which one do I need?"), and on the first `/cecicela` in a conversation, offer four choices. Use the host's question tool when there is one (AskUserQuestion in Claude Code, a choice card in a chat app); otherwise a numbered list answered with one number:

1. **Start something new** (Recommended when nothing is open): the user says the goal, the change, or the failure in a sentence; you pick the skill (below) and hand off.
2. **Review what is remembered**: what the work dir and this host already hold about the user's ceciCela work (below), then resume, start fresh, or stop.
3. **See all options**: the help card (below).
4. **Improve my prompt**: rewrite the user's request so the right skill gets everything it needs, as `playbooks/optimize.md` says.

Say one line under each choice about what happens next. Skip the menu when `/cecicela` arrives with a task: route it directly. When that task is vague (no outcome, no way to tell it is done), offer choice 4 once, in one line, and route anyway if the user declines.

## Pick

| The user wants | Hand off to | Say |
| --- | --- | --- |
| A goal broken into jobs, run in order, with a stop before contact, posting, payment, or a price | `/ceci` | `/ceci <goal> --work-dir <dir>` |
| Proof that one code, data, or model change is done, measured by a tool | `/cela` | `/cela <task>` |
| A bug, incident, or failure that earlier attempts did not fix | `/trouble` | `/trouble` plus the exact error |

If two fit, the order is: something is broken now, so `/trouble`; one change to prove, so `/cela`; several steps toward a goal, so `/ceci`. ceci calls `/cela` itself on every job that changes code, data, or a model, so do not call both.

If nothing fits, say so in one line and do not invent a fourth workflow.

## Hand off

State which skill and why in one sentence, then load that skill and follow it for this task. When handing off to `/ceci`, pass along any `--resume`, `--fresh`, `--new-dir PATH`, `--animate chat|terminal|off`, or `--budget low|medium|creator` the user typed. ceci asks about an existing plan and the animation before it starts. In Claude Code a plugin namespaces its skills: from the ceciCela plugin they are `/cecicela:ceci`, `/cecicela:cela`, and `/cecicela:trouble`; the short names work when nothing else claims them.

## Review what is remembered

Read, never guess. Report each item with where it came from:

- **The work dir** (the current directory, or one the user names): if it holds `brief.md` or `state.md`, run `node <ceci skill>/tool/ceci.js prep --work-dir <dir>` and give its summary line, the jobs at a gate, the newest feedback, and any archived `runs/`. In a chat, read the `brief.md` and `state.md` that are attached or in the Project instead.
- **This host's memory**: when the host keeps memories about the user (claude.ai or ChatGPT memory, Claude Code's memory files), say what they hold about ceciCela work: plans by name, a preferred animation or budget, feedback given before. Quote it; do not add to it.

If both are empty, say so in one line and offer choice 1. Otherwise end with: resume a plan (hand off to `/ceci --resume --work-dir <dir>`), start fresh, or stop.

## Help card

On `/cecicela help`, `--help`, `-help`, or `help` (and choice 3), reply with this card as written and run nothing:

```text
ceciCela  ceci plans this, cela proves that, trouble fixes what breaks.

Skills
  /ceci <goal>        plan a goal as jobs with stops for a human yes; run it; prove each change
  /cela <task>        prove one change is done: a tool, not the model, prints COMPLETE
  /trouble <error>    debug what earlier fixes did not: evidence, ranked causes, four votes

Front door
  /cecicela                  start menu: start, review what is remembered, options, improve my prompt
  /cecicela optimize <text>  rewrite a request so the right skill gets what it needs
  /cecicela memories         what the work dir and this host remember about your ceciCela work
  /cecicela feedback         how the last result landed: good, adjust, retry, or report a problem
  /cecicela status | install | update
  /cecicela uninstall        remove ceciCela: everywhere, from one directory, or from the web apps

While ceci runs, type any time
  budget low|medium|creator     how often the view updates (low: fewest tokens)
  animate chat|terminal|off     where the graph shows
  graph on|off   legend   show graph   help

In the player and in ceci status --watch, the keys are on the bottom row; B is the budget.
Each command line has its own manual:  ceci help | cela --help | trouble --help
```

## Feedback

After every result (a ceci run handing back, a trouble verdict, a cela review, an improved prompt), ask once how it landed, and act on the answer as `playbooks/feedback.md` says: good, adjust, retry another way, or report a problem with ceciCela on GitHub. `/cecicela feedback` asks about the most recent result. Never ask in an unattended run, and never twice for the same result.

## Commands the user may type

- `/cecicela optimize <text>`: `playbooks/optimize.md` on that text.
- `/cecicela memories`: the review above.
- `/cecicela status`: run `cecicela status` if the command exists, and show where each skill is installed. If it does not exist, say the bundle CLI is not installed.
- `/cecicela install`: tell the user to run `npx --yes @actvite/cecicela install --all` in a terminal, then restart the agent session. Do not run an install yourself.
- `/cecicela update`: tell the user to run `npx --yes @actvite/cecicela@latest update`, then restart the session.
- `/cecicela uninstall`: ask where, with the host's question tool, then give the matching step. Uninstall always removes /ceci, /cela, /trouble, and /cecicela together, and only what ceciCela wrote.
  1. **Everywhere on this machine**: every agent's skills folder, the Claude `/cela` command, and the cela engine. Run `npx --yes @actvite/cecicela@latest uninstall --all` in a terminal. `--dry-run` first lists what would go; the cela memory (`~/.cela`) is kept unless `--purge` is added.
  2. **Just one directory**: what `cela init` wrote in a project (its bridges, skill folders, and the Claude Code Stop hook). Ask for the path (the current directory if the user says so), then run `npx --yes @actvite/cecicela@latest uninstall --dir <path>`. Its `.cela/` records are kept unless `--purge` is added.
  3. **Just the web apps**: a command line cannot reach them. Give these steps: Claude (claude.ai and the desktop app): Settings → Capabilities → Skills, delete ceci, cela, trouble, and cecicela, and delete a ceciCela Project from its menu. ChatGPT and Grok: delete the ceciCela Project from its menu. Microsoft 365 Copilot: remove the ceciCela agent (Teams: Apps → Manage your apps); an agent the organization deployed is removed by its admin. `npx --yes @actvite/cecicela uninstall --web` prints the same steps.

  After choice 1 or 2, also restart the agent session. If ceciCela came from a marketplace plugin, `claude plugin uninstall cecicela@cecicela` (or `grok plugin uninstall cecicela --confirm`, `copilot plugin uninstall cecicela`) removes that. Do not run any of these yourself.

Never install, update, or remove anything on the user's machine from this skill.
