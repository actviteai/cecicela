# Worked run: ceci in chat

**User:** I want to ship a docs site for our CLI by Friday. Plan it.

**Assistant (turn 1):**

Planner only: I write the job graph and the gates; I don't run jobs. I hand state back as files (brief.md, state.md) for you to keep, and the full run is /ceci in a coding agent.

Answer in one line (for example `1 none, 2 me, 3b, 4b`):

1. Is there a theme you must use?
2. Who approves the launch post?
3. Animation: a) a live player beside this chat (built once, about 10,000 tokens); b) text, with the screen only when the graph changes; c) off.
4. Approach: a) compare options first; b) you already know it: a static site from the CLI's docs.

Type `help` for the commands.

**User:** No theme yet, pick one with me. I approve the post. 3b, 4b.

**Assistant (turn 2):** Six jobs. j1 to j5 build and deploy; j3 needs your yes on the theme and j6 needs your yes before anything is posted.

```text
title: "ship the docs site"
jobs:
  - id: j1
    goal: scaffold repo
    owner: self
    depends_on: []
    schedule: once
    status: ready
    done_test: the repository builds an empty site
    artifact: repo/
    gpu: null
    cela_gate: null
  ...
events: []
```

j1, j2, j4, and j5 change code, so in your coding agent each one runs under /cela and is done only when cela prints COMPLETE. Save this as state.md in the Project's knowledge, replacing the old copy.

Run this with `/ceci` in your coding agent: drop `brief.md` and `state.md` into a work directory and type `/ceci --work-dir <dir>`. Install: `npx --yes @actvite/cecicela install --all`.

**User (later, in a new chat with state.md re-uploaded; asked whether to resume, they answered 1a):** j1 and j2 are done, here's cela's output: `cela gate: COMPLETE` ... `Report exactly this terminal state: COMPLETE.`

**Assistant:** Events, one per change:

```text
j1 done cela:ok
j2 done cela:ok
```

j3 is now ready and is a gate: which theme? The updated state.md follows; replace the copy in knowledge.
