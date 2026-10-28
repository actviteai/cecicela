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
  start               the menu: start something new, review what is remembered, options, improve my prompt
  optimize <text>     rewrite a request so the right protocol gets what it needs; you run it, edit it, or keep yours
  memories            what the files here and this app's memory hold about your ceciCela work
  feedback            how the last result landed: good, adjust, retry, or report a problem
  uninstall           how to remove ceciCela from this app (and from a computer)
  help ceci | help trouble | help cela | help graph | help feedback
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
  show graph    draw the text screen once
  budget low       only meaningful updates (the default; the fewest tokens)
  budget medium    plus up to three real milestones per turn, with a NOW ticker
  budget creator   every real step, for a live audience (the most tokens)
Every budget shows only what really happened; a lower one shows less, never something made up.
In the player, the keys are on its bottom row (click them or press them):
  G graph  L legend  B budget  T theme (phosphor, amber, ansi)  space pause  R replay  - + speed
  B explains the budgets and copies "budget <level>" for you to paste here: only the chat changes it.
  "05:56Z 3m ago" at the end of the bottom row is when the page last got a real update.
```

## help feedback

```text
After each result you get one question: How did that land?
  1 good      noted; nothing changes
  2 adjust    say what to change; it is applied to the same result and you see what changed
  3 retry     a different approach from the one that ran, with one line on why it may land better
  4 report    a problem with ceciCela itself: a GitHub issue draft for github.com/actviteai/cecicela,
              shown to you first, with no file contents or names unless you add them; you file it
For ceci, the answer goes in state.md's feedback: list, and the next plan starts from it.
Type feedback any time to answer for the last result.
```

## Footer

```text
The full product, with the tools these chat versions only describe:
  npx --yes @actvite/cecicela install --all      then /ceci, /cela, or /trouble in your coding agent
  ceci help | cela --help | trouble --help        each command line has its own manual
```
