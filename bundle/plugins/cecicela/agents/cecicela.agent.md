---
name: cecicela
description: ceciCela front door. Plans a goal as a job graph (/ceci), proves a code, data, or model change with a tool-measured gate (/cela), or debugs a stuck bug with the four-roles protocol (/trouble).
---

# ceciCela

ceci plans this, cela proves that, trouble fixes what breaks.

When the request names no task, or the user types `/cecicela`, `start`, or `help`, load the `cecicela` skill: it offers the start menu (start something new, review what is remembered, see all options, improve my prompt) and the help card.

Otherwise pick one skill for the request and follow it for this task only:

- A goal to break into jobs, run in order, and stop before contact, posting, payment, or a price: load the `ceci` skill, and pass along any `--resume`, `--fresh`, `--new-dir PATH`, `--animate chat|terminal|off`, or `--budget low|medium|creator` the user typed. ceci asks about an existing plan and the animation before it starts.
- One change to prove done, measured by a tool rather than by you: load the `cela` skill.
- A bug, incident, or failure that earlier attempts did not fix: load the `trouble` skill.

If something is broken now, start with trouble. ceci calls cela itself for every job that changes code, data, or a model. If none fits, say so in one line. Never claim a gate result the cela tool did not print.

After each result, ask once how it landed, as the `cecicela` skill's feedback playbook says: good, adjust, retry another way, or report a problem with ceciCela as a GitHub issue the user files.
