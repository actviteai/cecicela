# Testing the chat packs: ChatGPT, Claude, Grok

A manual test of ceciCela for Projects on the three web chat hosts. It takes about 45 minutes per host. Run the same eleven tests on each host and fill in the results table at the end. Microsoft 365 Copilot has its own test in [`chat/m365/SETUP.md`](../chat/m365/SETUP.md), because it needs a Frontier tenant.

The install line the packs end with (`npx --yes @actvite/cecicela install --all`) only works once the npm packages are published. Before that, test 11 checks only that the line is there.

## 0. Get the files

1. On GitHub, open `actviteai/cecicela`, choose **Code → Download ZIP**, and unzip it. Test from `main` once the audit pull request is merged; before that, switch to the `fix/audit-2026-10-25` branch first.
2. Each host has its own folder, generated from `chat/src/`. Never edit these by hand:

   | Host | Folder | Setup page |
   | --- | --- | --- |
   | ChatGPT | `chat/chatgpt/` | `chat/chatgpt/SETUP.md` |
   | Claude | `chat/claude/` | `chat/claude/SETUP.md` |
   | Grok | `chat/grok/` | `chat/grok/SETUP.md` |

3. Have these to paste. They are reused across tests:
   - **Bug report** (test 3):
     > Our Node API returns stale user profiles for about five minutes after an update, but only in production. We tried clearing Redis and restarting the pods; it came back. Error: none, just old data. Stack: Express 5, Redis 7, Cloudflare in front.
   - **Voices block, valid** (test 4):
     ```yaml
     voices:
       keeper: {who: Ada the librarian}
       detective: {who: Inspector Morse-code}
       maintainer: {who: the grumpy reviewer}
       physicist: {who: the clock-watcher}
     ```
   - **Voices block, invalid** (test 5): the same block with a fifth line, `  intern: {who: the new hire}`.
   - **A small diff** (test 6): any real diff of yours with its test output, or a two-line change with no test output.

## 1. Set up the Project

Follow the host's `SETUP.md` exactly. It lists every file and where it goes. Check off:

- [ ] Instructions pasted, all of `INSTRUCTIONS.md`. It is 3.4 KB, well under each host's limit.
- [ ] Files added: 11 (the 10 in `knowledge/`, including `knowledge/examples/`, plus `graph-player.html`); 5 on ChatGPT Free.
- [ ] The Project is named ceciCela.

Start every test in a **new chat inside the Project**, unless the test says otherwise.

## 2. The tests

| # | Do this | Pass when |
| --- | --- | --- |
| 1 | Type `hello, what can you do?` | It names the three protocols (trouble, ceci, cela) and what each is for, and starts none: no limits sentence, no `state.md`, no verdict block. |
| 2 | Type `Plan this goal: launch a docs site for our CLI by Friday` and nothing else | The **first reply opens with ceci's limit**: it plans, does not run jobs, and hands state back as `brief.md` and `state.md`. Then it asks at most the questions that change the graph. It does **not** stop because `brief.md` is missing. |
| 3 | New chat. Paste the **bug report** | The first reply opens with "Using the four-minds debug protocol", declares `mode: untooled`, and states the limit: it can't read files or run commands, confidence is capped at 6, and the incident stays open. Evidence is quoted as E1, E2… Hypotheses carry posteriors between 0 and 1; every N/10 score (the roles' scores, gate votes, verdict confidence) is **6 or less**. The four roles are **the archivist, the detective, the kernel maintainer, the physicist who specialises in time**: no real or fictional person's name. It ends with an EVIDENCE_REQUEST of exact commands, and a verdict block with `fix_applied: no` and `INCIDENT_RESOLVED=no`. |
| 4 | New chat. Paste the **valid voices block** and the bug report in one message | The roles appear under your names (Ada the librarian, and so on). What each role does is unchanged. |
| 5 | New chat. Paste the **invalid voices block** (five roles) and the bug report in one message | It refuses the block in one line, saying why (an unknown id, or not exactly four roles), and runs with the default names. |
| 6 | New chat. Type `Is this change really done?` and paste your **diff** | The first reply says no tool runs here and there is no gate. It walks the C1–C7 checklist with `[x]`, `[!]`, or `[ ]`, and quotes the line behind every `[x]` and `[!]`. After the checklist comes exactly one line, in one of three forms: `REVIEW: no blocking gaps found in what was pasted (not a measured result)`, `REVIEW: gaps found: <ids>`, or `REVIEW: cannot tell: <what to paste>`. Then the `/cela` hand-off with the install line. It **never** prints COMPLETE, STALLED, BLOCKED, or MISSING_TEST as a verdict. |
| 7 | Go back to test 2's chat. Answer its questions and let it finish the plan | It emits a complete `state.md` in one fenced block (or as a file), with jobs, `depends_on`, `done_test`, and an `events:` list. Code, data, or model jobs say they need `/cela` and have `cela_gate: null`. Any job that posts, pays, contacts someone, or sets a price is `gate` or `blocked` (never ready, running, or done), with no price, recipient, or amount filled in. `events:` may be empty (`[]`) in a new plan. The plan ends with the `/ceci --work-dir` hand-off and the install line. |
| 8 | Same chat. Do nothing new: look at the replies to tests 2 and 7 (the graph view is on by default for ceci) | **Claude:** an artifact opens beside the chat with the green 80×24 screen; [G], [F], [L] and space work. **ChatGPT:** the player opens in a canvas, or, if canvas isn't offered, a text screen appears in a code block. **Grok:** the player opens in Grok Studio, or the text screen appears. Pure ASCII, no box-drawing characters. |
| 9 | Same chat. Type `j1 is done, tests pass` | The reply marks the claim `UNVERIFIED` (you pasted no evidence) and adds event lines for j1 only: if j1 needs `/cela`, one line `j1 running cela:pending`, and j1 stays `running`, not `done`; otherwise `j1 done`. With the player open, it **edits** the player, appending one line to `EVENTS`, and does **not** emit a second copy of the player HTML (scroll up and check). |
| 10 | Same chat. Type `graph off`, then ask for one more change | No screen or player edit is drawn. The new `state.md` header says `graph: off`. Then start a **new chat**: upload or attach that `state.md` and type `continue the plan`. It picks up from the file, keeps `graph: off`, and draws nothing. |
| 11 | In a ceci chat with no player open (ChatGPT without canvas, or a text-screen host), type `graph frames`, then `legend` | Three code blocks reveal the same screen column by column (cut at columns 27, 54, then the whole screen); `legend` hides or shows the one-line LEGEND row on the next screen. With a player open, press **F** and **L** in the player instead; the model must not re-emit the player. Every protocol's hand-off includes `npx --yes @actvite/cecicela install --all`. |

## 3. Host notes

**ChatGPT.** Use a Project, not a GPT. Custom GPTs retire on 11 December 2026, and new GPTs can no longer be created on most plans, so there is nothing to test there. Free allows 5 files per Project; use the subset in `SETUP.md`, and expect the default role names in tests 3 and 5 to come from `trouble.chat.md`. Uploads take at most 10 files at a time.

**Claude.** Free allows up to five Projects; this one counts. Folders do not upload, so add the `examples/` files one by one. If `voices.default.yaml` is refused, upload it as `voices.default.yaml.txt`. The player asks for JetBrains Mono from Cloudflare's cdnjs; the artifact may block that stylesheet, so the screen in the system monospace font is a **pass**, not a failure, as long as the columns line up.

**Grok.** xAI does not publish the Projects instruction limit. Write the number Grok shows in the results. Record whether Grok Studio opened from the Project chat (test 8), and whether the Project has a share action; the README and release notes need both.

## 4. Results

Fill in one column per host. Write **P** for pass, **F** for fail (with a note), or **n/a**.

| Test | ChatGPT | Claude | Grok | Notes |
| --- | --- | --- | --- | --- |
| Setup (instructions + files) | | | | |
| 1 router | | | | |
| 2 ceci first reply | | | | |
| 3 trouble untooled | | | | |
| 4 voices valid | | | | |
| 5 voices invalid | | | | |
| 6 cela checklist | | | | |
| 7 ceci state.md | | | | |
| 8 player / text screen | | | | |
| 9 one-line edit, no second player | | | | |
| 10 graph off survives re-upload | | | | |
| 11 frames, legend, install line | | | | |
| Instruction limit shown by host | | | | |
| Player surface (artifact / canvas / Studio / text) | | | | |
| Share action exists | n/a | org only | | |

A failure in tests 2, 3, 6 or 9 is a protocol or router bug: fix it in `chat/src/` (chat rules) or `packages/<name>/skill/` (protocol text) in a worktree and pull request, run `npm run sync`, and re-upload. A failure in test 8 is usually the host's surface. Note it and check the fallback works.
