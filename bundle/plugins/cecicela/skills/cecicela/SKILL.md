---
name: cecicela
description: Front door for ceciCela. Use on /cecicela, or when the user is unsure whether to plan a goal (ceci), prove a change (cela), or debug what broke (trouble). Names the skill that fits and hands off.
license: GPL-3.0-or-later
---
# ceciCela

ceci plans this, cela proves that, trouble fixes what breaks. This skill does no work itself: it picks one of the three and hands off. Keep the reply to a few lines.

## Pick

| The user wants | Hand off to | Say |
| --- | --- | --- |
| A goal broken into jobs, run in order, with a stop before contact, posting, payment, or a price | `/ceci` | `/ceci <goal> --work-dir <dir>` |
| Proof that one code, data, or model change is done, measured by a tool | `/cela` | `/cela <task>` |
| A bug, incident, or failure that earlier attempts did not fix | `/trouble` | `/trouble` plus the exact error |

If two fit, the order is: something is broken now, so `/trouble`; one change to prove, so `/cela`; several steps toward a goal, so `/ceci`. ceci calls `/cela` itself on every job that changes code, data, or a model, so do not call both.

If nothing fits, say so in one line and do not invent a fourth workflow.

## Hand off

State which skill and why in one sentence, then load that skill and follow it for this task. When handing off to `/ceci`, pass along any `--resume`, `--fresh`, `--new-dir PATH`, or `--animate chat|terminal|off` the user typed. ceci asks about an existing plan and the animation before it starts. In Claude Code a plugin namespaces its skills: from the ceciCela plugin they are `/cecicela:ceci`, `/cecicela:cela`, and `/cecicela:trouble`; the short names work when nothing else claims them.

## Commands the user may type

- `/cecicela help` (or `--help`, `-help`): list the three skills with one line each, the commands below, and that each tool prints its own manual with `--help` (`ceci help <command>`). Do not run anything.
- `/cecicela status`: run `cecicela status` if the command exists, and show where each skill is installed. If it does not exist, say the bundle CLI is not installed.
- `/cecicela install`: tell the user to run `npx --yes @actvite/cecicela install --all` in a terminal, then restart the agent session. Do not run an install yourself.
- `/cecicela update`: tell the user to run `npx --yes @actvite/cecicela@latest update`, then restart the session.

Never install, update, or remove anything on the user's machine from this skill.
