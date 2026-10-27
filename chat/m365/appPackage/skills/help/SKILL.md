---
name: help
description: "ceciCela help: the short manual for trouble, ceci, cela, and the graph commands. Use when the user types help, --help, -help, /help, or ?."
---

# ceciCela help

Reply with the one section the user asked for (`help` alone is the first), copied as written, and start nothing. Every section ends with the footer.

## help

```text
ceciCela  ceci plans this, cela proves that, trouble fixes what breaks.

  trouble   a bug or incident nothing has fixed: evidence, ranked causes, a fix only when all four roles agree
  ceci      a goal planned as a job graph with stops before contact, posting, payment, or a price
  cela      "is this change really done?": a review checklist for what you paste

Just describe what you need. Or type:
  help ceci | help trouble | help cela | help graph
```

## help ceci

```text
ceci in chat plans; it does not run jobs. It hands back brief.md (your rules) and state.md (the graph).

Before planning it asks, in one message:
  1 plan       resume the state.md you attached, or start a new one (only when one is attached)
  2 brief      keep the rules in your brief.md, or edit them first (only when one is attached)
  3 animation  live player beside the chat, text screens, or off; and the budget: low, medium, creator
  4 approach   compare options first, or you name the approach (new plans)
Answer in one line, like: 1a 2a 3b 4a

To continue another day: attach the latest state.md and brief.md and say "continue".
To run the plan: /ceci --work-dir <dir> in a coding agent.
```

## help trouble

```text
trouble in chat cannot see your files or run anything, so it asks for evidence and caps confidence at 6.
Paste: the exact error, what changed, what you already tried, and the output of any check it asks for.
It ranks causes, has four roles vote, and proposes a fix only when all four agree.
The incident stays open until you run the check and paste the result.
```

## help cela

```text
cela in chat reviews; no tool runs, so nothing it says is a measured result.
Paste: the request, the diff, and the test output. It lists what is missing and what evidence would close each item.
For a measured COMPLETE, run /cela in a coding agent.
```

## help graph

```text
Type any of these, any time:
  graph on      draw the 80x24 screen as text when the graph changes
  graph off     stop drawing for the rest of the plan (saved in state.md)
  graph frames  reveal the screen column by column
  legend        show or hide the legend row
  budget low       only meaningful updates (the default; the fewest tokens)
  budget medium    plus up to three real milestones per turn, with a NOW ticker
  budget creator   every real step, for a live audience (the most tokens)
Every budget shows only what really happened; a lower one shows less, never something made up.
In the player: G graph, F frames, L legend, space pause, S step, T theme, - + speed, R replay.
```

## Footer

```text
The full product, with the tools these chat versions only describe:
  npx --yes @actvite/cecicela install --all      then /ceci, /cela, or /trouble in your coding agent
  ceci help | cela --help | trouble --help        each command line has its own manual
```
