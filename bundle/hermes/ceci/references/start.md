# Start: the Prep step

Every run starts here, before rule 1. It costs one read-only command and one question call, and it is the only point where the user can stop an old plan or an old brief from steering a new run.

## 1. Read what is there

```text
ceci prep --work-dir PATH --json
```

Use its fields as they are; do not open the files again to recount. `summary` is the sentence for question 1. `ask` lists the questions that apply: `plan` when state.md has jobs (or does not parse), `brief` when brief.md exists, and always `animate`, `approach`, and `budget`.

## 2. Ask, once

Drop every question a flag already answers. Put the rest in one AskUserQuestion call (it takes up to four; when five remain, Q5 follows in a second call, only if Q3 turned the animation on). Where that tool is missing, ask the same questions in one plain-text message, numbered, so one line answers them all (`1a 2a 3c 4a`). Use this wording.

**Q1. Plan** (only when `ask` has `plan`). Header `Plan`. Question: the `summary` sentence, then "What should this run do?"

| Option | Does | Records |
| --- | --- | --- |
| Resume this plan | keeps every file; rule 1 continues from state.md | `start: resumed` |
| New plan, keep the old one | `ceci archive --work-dir PATH --keep-brief` moves the old plan into `runs/<time>/` and deletes nothing; then init writes a fresh state.md and log.md | `start: fresh` |
| New plan in another folder | ask for the folder (or use `--new-dir PATH`); the old folder is untouched; every later command uses the new path | `start: new-dir` |

**Q2. Brief** (only when `ask` has `brief`). Header `Brief`. Question: "The brief says:" then its fields from `brief.fields`, one per line (number or target, never, deadline, tools, and any counting rule), then "Keep it?"

| Option | Does |
| --- | --- |
| Keep the brief as is | nothing changes |
| Edit it first | stop and ask the user for the new rules in their words; write them into brief.md and show the result before any job or search starts |

A rule in the brief limits every job after it ("public tenders only"). This question is where a wrong one gets caught.

**Q3. Live animation.** Header `Animation`. Question: "Show the job graph while it runs?"

| Option | Does | Records |
| --- | --- | --- |
| Yes, in this chat | a live page beside the chat, updated as the budget says (Player in `playbooks/graph.md`). Offer it only when the host can show an HTML page: by path (Claude Code's artifact publish costs no tokens) or as a page you build once (about 10,000 tokens, then one line per update); say which in the option. | `animate: chat` |
| Yes, in my terminal | print the `ceci status --watch` command for the user to run in a second terminal; it costs no tokens | `animate: terminal` |
| No | event lines only | `animate: off` |

**Q4. Approach** (for a new plan; when Q1 is asked too, its answer is ignored if the user resumes). Header `Approach`. Question: "Do you already know how to reach the goal?"

| Option | Does | Records |
| --- | --- | --- |
| Compare options first | the first job is `options`, artifact `options.md`: the possible approaches and the evidence for each. Every other job depends on it (rule 2). | `approach: compare` |
| I already know the approach | the user types it (the tool's "Other" field, or a follow-up line); write it into brief.md as `approach_note:` | `approach: given` |

**Q5. Budget** (skipped when Q3 is No, or by `--budget`). Header `Budget`. Question: "How much of your token budget should the animation use?" Every budget shows only real work; they differ in how often the view updates (Budget in `playbooks/graph.md`).

| Option | Does | Records |
| --- | --- | --- |
| Low (Recommended) | only meaningful updates: the view changes when a job ends or stops at a gate | `budget: low` |
| Medium | up to three real milestones per job, a NOW line with the newest one, and an update when a job starts | `budget: medium` |
| Content creator | a step after every action and an update after every event, with BBS colours and effects on each real change, for a live audience; uses the most tokens | `budget: creator` |

The user can change it later by typing `budget low`, `budget medium`, or `budget creator`, or with the B key in `--watch`. Say so in the question.

## 3. Record

```text
ceci init --work-dir PATH --start resumed|fresh|new-dir --animate chat|terminal|off [--approach compare|given] [--budget low|medium|creator]
```

It creates whatever is missing and sets only those lines in brief.md, plus `prepped: <UTC minute>`. `ceci status` warns when `prepped:` is missing: that plan skipped this step. When `ceci prep` listed feedback from an earlier run, say in one line how this run uses it. Then go on to rule 1.

## Flags that skip a question

| Flag | Skips | Same as |
| --- | --- | --- |
| `--resume` | Q1 | Resume this plan |
| `--fresh` | Q1 | New plan, keep the old one |
| `--new-dir PATH` | Q1 | New plan in another folder, at PATH |
| `--animate chat\|terminal\|off` | Q3 | that option |
| `--budget low\|medium\|creator` | Q5 | that option |

Q2 is skipped only when there is no brief. Q4 is skipped when the plan is resumed.

## Unattended runs

Nobody can answer (a schedule, CI, a headless `-p` run). Do not wait. Choose: a new plan with the old one archived (`ceci archive --keep-brief`, which can be undone by moving the files back), keep the brief, animation off, budget low, approach compare. The run's first line says so, for example `prep (unattended): archived to runs/2026-10-26T205600Z, brief kept, animation off, approach compare`. A scheduled run that is meant to continue its plan passes `--resume`.
