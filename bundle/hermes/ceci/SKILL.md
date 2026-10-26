---
name: ceci
description: "Use when the user invokes /ceci. It keeps the job graph, stops before a price, and calls /cela for evidence."
version: 2.1.0
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [job-graph, human-gates, gpu, cela]
    requires_toolsets: [terminal]
---
# ceci
ceci owns the job graph and human gates. It calls /cela only when a job needs an evidence gate on code, data, or scoring. It is standalone: no hardcoded names, hosts, or projects. All external information arrives by flag or file.
## Files
In `--work-dir` (required):
- `brief.md` — number, never-list, deadline, tools, and the start choices. Read first every run.
- `state.md` — jobs as nodes. Update after every job.
- `log.md` — append-only, one line per run.
`gpu-prefs.yaml` is required when any job sets `gpu`. Pass it with `--gpu-pref`.
## Flags
- `--work-dir PATH` (required)
- `--gpu-pref PATH` (required if any job has a gpu field)
- `--notify-bot ID` (optional; post status if present)
- `--qa-bot ID` (optional; request check if present)
- `--deadline TIME` (optional; record in brief.md)
- `--resume` | `--fresh` | `--new-dir PATH` (optional; answers Prep question 1)
- `--animate chat|terminal|off` (optional; answers Prep question 3)
If a flag is absent, do not assume a value and do not reference any external agent.
## Prep
Before rule 1, every run, follow `references/start.md`:
1. Run `ceci prep --work-dir PATH --json`. It only reads.
2. Ask the questions it lists in `ask` that no flag already answers, all in one AskUserQuestion call (at most four). Without that tool, ask them in plain text in one message.
3. Record the answers with `ceci init --work-dir PATH --start ... --animate ... [--approach ...]`, then go on to rule 1.
Unattended (nobody can answer): new plan, archive the old one with `ceci archive --keep-brief`, keep the brief, animation off, approach compare. Say these choices in the run's first line. A scheduled run that should continue its plan passes `--resume`.
## Rules
1. Read `brief.md` and `state.md` first. If either is missing, run init behavior and stop.
2. On a new goal, decompose into the smallest jobs that produce one inspectable artifact. Write the complete graph to `state.md` before starting any job. Each job has id, goal, owner, depends_on, schedule, status, done_test, artifact, gpu, and cela_gate (gpu and cela_gate are null when unused). With `approach: compare` the first job is `options`: its artifact is `options.md` (the possible approaches and the evidence for each), and every other job depends on it, directly or through another job, so no search or channel work starts before it is done.
3. A job is done only when its done_test passes and the artifact exists. Update status and append one line to `log.md`.
4. Human gates: stop and hand back before contact, post, pay, or setting a price. Leave the price blank. Mark unverified claims UNVERIFIED.
5. For any job that changes code, data, or a model, call /cela and store the exact gate output in cela_gate. COMPLETE is the only accepted terminal state for those jobs.
6. GPU jobs: run `ceci resolve-gpu` with the preference map, record its first line in the job's gpu field, and export the CUDA lines it prints for that job only. If it prints no CUDA_VISIBLE_DEVICES for a specific device, follow its stderr note before the job starts.
7. After every job, update state.md and append exactly one line to log.md. Schedule the next ready job if one exists.
8. Every status change also appends one event line to the `events:` list in state.md: `<job> <status>`, plus `cela:<ok|pending|stalled|blocked|missing_test>` or `gate:<word>` when they apply. Use `ceci event`.
9. Animation costs tokens only when you draw. With `animate: chat`, after each job's last event (rule 7) and at a stop, run `ceci player --work-dir PATH --out PATH/graph-player.html` in the same shell call as that event and republish the file by path; the page replays every event. Never read or paste the page. With `animate: terminal`, print `node <this skill>/scripts/ceci.js status --work-dir PATH --watch` once for the user; never run `--watch` yourself, it does not exit. Check the graph with plain `ceci status`; run `--screen` only when the user asks to see it.
## State schema
```yaml
title: string            # optional: the goal in a few words
graph: on | off | frames # optional: the graph view; default on
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
events:                  # optional: one line per status change, oldest first
  - "j1 done cela:ok"
```
## CLI
The skill uses `scripts/ceci.js` (zero-dependency Node). Run `node ${HERMES_SKILL_DIR}/scripts/ceci.js`.
- `ceci prep --work-dir PATH --json` — what the work dir holds: title, job counts, gate jobs, last log line, brief fields, archived runs, the start questions that apply. Read-only.
- `ceci init --work-dir PATH [--start resumed|fresh|new-dir] [--animate chat|terminal|off] [--approach compare|given]` — creates any missing `brief.md`, `state.md`, or `log.md` and never overwrites one. The start flags set only those lines and `prepped:` in brief.md. It does not record a deadline.
- `ceci status --work-dir PATH` — lists ready, running, blocked, and gate jobs; exits 1 if the graph is inconsistent. `--screen` prints the 80x24 graph view once; `--watch` redraws it as state.md changes.
- `ceci event --work-dir PATH --line TEXT` — applies one event line to the job it names and appends it to `events:`.
- `ceci resolve-gpu --work-dir PATH --gpu-pref PATH --model NAME [--busy HOST:DEVICE]`
- `ceci log --work-dir PATH --line TEXT`
- `ceci archive --work-dir PATH [--to NAME] [--keep-brief]` — moves brief.md, state.md, log.md, and every artifact state.md names into `runs/<UTC time>/`. Never deletes; refuses an existing destination; prints the new path.
- `ceci player --work-dir PATH --out FILE` — writes the self-contained graph player for the current state.md.
- `ceci help [COMMAND]` — the usage, or one command's page.
Prefer these commands over free-form file writes.
## Playbooks
- `references/start.md` — the Prep questions, what each answer does, flags, unattended defaults.
- `references/graph.md` — schema, transitions, dependency rules, events, graph view.
- `references/gates.md` — stop conditions, blank-price rule, hand-back format.
- `references/gpu.md` — preference YAML, CUDA env, fallback, logging.
- `references/cela.md` — when and how to call /cela, how to store the gate.
- `examples/gpu-prefs.yaml` — preference-file shape; no real hostnames.
- `scripts/tui.js` — the graph view renderer the engine loads for `status --screen` and `--watch`.
- `scripts/graph-player.html` — the page template `player` fills in.
- `scripts/package.json` — keeps the engine CommonJS when an ancestor package.json sets "type": "module".
## Done
A run ends when the next action is a human gate, the deadline is reached, or no ready jobs remain. Hand back the current state.md, the blank-price line if an offer exists, and the player link when there is one.
