# Job graph

`state.md` is the whole graph. Write it before any job starts. The CLI parses only the subset below.

## Schema

```yaml
title: string
graph: on | off | frames
jobs:
  - id: string
    goal: string
    owner: string
    depends_on: [string]
    schedule: once | cron
    status: ready | running | blocked | done | gate
    done_test: string
    artifact: path
    gpu: null | "host:device"
    cela_gate: null | COMPLETE | STALLED | BLOCKED | MISSING_TEST
events:
  - "job status [cela:token] [gate:word]"
```

`title:` and `graph:` are optional header lines before `jobs:`, in that order. `title` is the goal in a few words. `graph` is `on`, `off`, or `frames`; it is absent when it is `on`. `events:` is an optional list after the jobs, one double-quoted line per item, oldest first.

`jobs: []` is the empty graph. A job starts with `  - id:`. Other keys are indented four spaces, in the order above. Flow lists use `[]` or `[a, b]`. A plain value is read as written, spaces included. Use a double-quoted, JSON-escaped string for a value that is empty, is the word `null`, starts with `"` or `[`, or is a list item that contains a comma. `gpu: null` and `cela_gate: null` are the empty values. Paths in `artifact` are relative to `--work-dir`, with no `..` segment, and name a file or directory inside it (not `.`).

`owner` is the value supplied for that job, or `self`. `schedule` is `once` or `cron`. Do not add keys the schema does not list.

## Dependencies

- Every `depends_on` id exists, and a job does not depend on itself.
- The graph is acyclic.
- `ready` and `running` are legal only when every dependency is `done`.
- Otherwise the job is `blocked`, or `gate` when a human gate applies.

## Status transitions

- `blocked` → `ready` when every dependency is `done` and no human gate applies.
- `ready` → `running` when the job starts.
- `running` → `done` only when the done test has passed and the artifact exists. If the job changes code, data, or a model, `cela_gate` must be `COMPLETE`.
- `running` → `gate` before contact, post, pay, or a price. Do not invent the human's answer.
- `running` → `blocked` when an external input is missing and it is not a human gate.
- `gate` stays `gate` until the human answers.
- `done` is terminal. Never move `blocked` straight to `done`.

`ceci status` prints stored `ready`, `running`, `blocked`, and `gate` jobs and exits non-zero if a `done` job is missing its artifact, if `cela_gate` is set to anything but `COMPLETE` on a `done` job, or if a `ready` or `running` job has an unfinished dependency.

## Events

Every status change is one event line, appended to `events:` by `ceci event --work-dir PATH --line TEXT`:

```text
<job> <status> [cela:ok|pending|stalled|blocked|missing_test] [gate:<word>]
```

`ceci event` sets that job's `status`, sets `cela_gate` from `cela:` (`ok` is `COMPLETE`; `pending` leaves it null), refuses a job or status the graph does not have, and refuses a change the status transitions above forbid, and refuses `done` while the artifact is missing. Events are history for the graph view and for a new conversation that rebuilds the picture from state.md alone; the job fields stay the truth.

## Graph view

`ceci status --work-dir PATH --screen` prints the graph as an 80x24 ASCII screen once. `--watch` redraws it in place as state.md changes: a spinner on running jobs, a blinking `! GATE: human` on gate jobs, packets moving along the edges into them. Box borders: `+--+` not done, `+==+` done. `graph: off` in state.md turns the drawing off; `graph: frames` reveals the first screen column by column. Hotkeys in `--watch`: G graph, F frames, L legend, space pause, S step, T theme, - and + speed, R reset, Q quit.

## Log

A run is one job status change. Append exactly one line and nothing else:

```text
YYYY-MM-DDTHH:MMZ | job_id | status | note
```

Use `ceci log --work-dir PATH --line TEXT`. Do not write a second line for the same change.

## Example

Graph first. `offer` is blocked on `score`. No artifact has been created yet.

```yaml
jobs:
  - id: score
    goal: Score the supplied sample
    owner: self
    depends_on: []
    schedule: once
    status: ready
    done_test: cela gate prints COMPLETE and the artifact exists
    artifact: score.txt
    gpu: null
    cela_gate: null
  - id: offer
    goal: Prepare an offer
    owner: self
    depends_on: [score]
    schedule: once
    status: blocked
    done_test: a human supplied the missing decision
    artifact: offer.md
    gpu: null
    cela_gate: null
```
