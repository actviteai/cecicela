# Testing the chat packs: ChatGPT, Claude, Grok

A manual test of ceciCela for Projects on the three web chat hosts. It takes about 45 minutes per host. Run the same fourteen tests on each host and fill in the results table at the end. Microsoft 365 Copilot has its own test in [`chat/m365/SETUP.md`](../chat/m365/SETUP.md), because it needs a Frontier tenant.

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
- [ ] Files added: 12 (the 11 in `knowledge/`, including `help.md` and `knowledge/examples/`, plus `graph-player.html`); 5 on ChatGPT Free.
- [ ] The Project is named ceciCela.

Start every test in a **new chat inside the Project**, unless the test says otherwise.

## 2. The tests

| # | Do this | Pass when |
| --- | --- | --- |
| 1 | Type `hello, what can you do?` | It names the three protocols (trouble, ceci, cela) and what each is for, and starts none: no limits sentence, no `state.md`, no verdict block. |
| 2 | Type `Plan this goal: launch a docs site for our CLI by Friday` and nothing else | The **first reply opens with ceci's limit**: it plans, does not run jobs, and hands state back as `brief.md` and `state.md`. Then, in **one** message, it asks the questions that change the graph together with the start questions that apply: no plan or brief is attached, so only **3 animation** (player beside the chat, about 10,000 tokens / text / off; no player option on a host without a live surface) and **4 approach**. It does **not** stop because `brief.md` is missing, and it builds **no player yet**. The reply ends with "Type `help` for the commands." |
| 3 | New chat. Paste the **bug report** | The first reply opens with "Using the four-minds debug protocol", declares `mode: untooled`, and states the limit: it can't read files or run commands, confidence is capped at 6, and the incident stays open. Evidence is quoted as E1, E2… Hypotheses carry posteriors between 0 and 1; every N/10 score (the roles' scores, gate votes, verdict confidence) is **6 or less**. The four roles are **the archivist, the detective, the kernel maintainer, the physicist who specialises in time**: no real or fictional person's name. It ends with an EVIDENCE_REQUEST of exact commands, and a verdict block with `fix_applied: no` and `INCIDENT_RESOLVED=no`. |
| 4 | New chat. Paste the **valid voices block** and the bug report in one message | The roles appear under your names (Ada the librarian, and so on). What each role does is unchanged. |
| 5 | New chat. Paste the **invalid voices block** (five roles) and the bug report in one message | It refuses the block in one line, saying why (an unknown id, or not exactly four roles), and runs with the default names. |
| 6 | New chat. Type `Is this change really done?` and paste your **diff** | The first reply says no tool runs here and there is no gate. It walks the C1–C7 checklist with `[x]`, `[!]`, or `[ ]`, and quotes the line behind every `[x]` and `[!]`. After the checklist comes exactly one line, in one of three forms: `REVIEW: no blocking gaps found in what was pasted (not a measured result)`, `REVIEW: gaps found: <ids>`, or `REVIEW: cannot tell: <what to paste>`. Then the `/cela` hand-off with the install line. It **never** prints COMPLETE, STALLED, BLOCKED, or MISSING_TEST as a verdict. |
| 7 | Go back to test 2's chat. Answer its questions (choose **3a**, the live player, where the host offers it) and let it finish the plan | It emits a complete `state.md` in one fenced block (or as a file), with jobs, `depends_on`, `done_test`, and an `events:` list. Code, data, or model jobs say they need `/cela` and have `cela_gate: null`. Any job that posts, pays, contacts someone, or sets a price is `gate` or `blocked` (never ready, running, or done), with no price, recipient, or amount filled in. `events:` may be empty (`[]`) in a new plan. The plan ends with the `/ceci --work-dir` hand-off and the install line. |
| 8 | Same chat, after answering **3a** (live player) in test 7 | The player is built once, only after that answer. **Claude:** an artifact opens beside the chat with the green 80×24 screen; [G], [L], [B], [T] and space work, by key and by click. There is **one** key panel, the screen's bottom row, and no buttons under it. **ChatGPT:** the player opens in a canvas, or, if canvas isn't offered, a text screen appears in a code block. **Grok:** the player opens in Grok Studio, or the text screen appears. Text screens are pure ASCII; only the player's ansi theme ([T]) draws box lines. |
| 9 | Same chat. Type `j1 is done, tests pass` | The reply marks the claim `UNVERIFIED` (you pasted no evidence) and adds event lines for j1 only: if j1 needs `/cela`, one line `j1 running cela:pending`, and j1 stays `running`, not `done`; otherwise `j1 done`. With the player open, it **edits** the player, appending one line to `EVENTS`, and does **not** emit a second copy of the player HTML (scroll up and check). |
| 10 | Same chat. Type `graph off`, then ask for one more change | No screen or player edit is drawn. The new `state.md` header says `graph: off`. Then start a **new chat**: upload or attach that `state.md` and type `continue the plan`. It picks up from the file, keeps `graph: off`, and draws nothing. |
| 11 | In a ceci chat with no player open (ChatGPT without canvas, or a text-screen host), type `graph frames`, then `legend` | Three code blocks reveal the same screen column by column (cut at columns 27, 54, then the whole screen); `legend` hides or shows the one-line LEGEND row on the next screen. With a player open, press **F** and **L** in the player instead; the model must not re-emit the player. Every protocol's hand-off includes `npx --yes @actvite/cecicela install --all`. |
| 12 | New chat. Attach the `state.md` and `brief.md` from test 7 and type `plan it again` | It does **not** continue silently. One message summarises the plan (title, N of M done, gate jobs) and asks **1 plan** (resume / new), **2 brief** (shows the fields; keep / edit), and **3 animation**. Answering `2b` makes it ask for the new rules before any job is planned. |
| 13 | New chat. Type `help`, then `help graph`, then `-help` | Each reply is the matching section of `help.md` with its footer, and nothing else: no protocol starts, no limits sentence, no `state.md`. `help graph` lists `animate`, `graph on/off/frames`, `legend`, `show graph`, and the player keys, B budget included. `help` lists `start`, `optimize`, `memories`, and `feedback`. |
| 14 | New chat. Plan a small goal; choose the live player (or text) and type `budget creator`. Then paste real test output, for example `npm test: 41 pass, 0 fail`, and type `budget low` and paste another line | Under creator, the reply adds a `step` line that copies the pasted numbers exactly, the screen shows `NOW` with that step, and the title bar says `creator`. Under low, no `step` line is written and no screen is drawn unless you ask. At no budget does it add a step for something you did not paste or it did not do, or an estimate or percentage. |
| 15 | New chat. Type `cecicela` | A four-choice menu, one line under each: **1 Start something new** (recommended), **2 Review what is remembered**, **3 See all options**, **4 Improve my prompt**. Choice buttons where the host has them, else numbers. No protocol starts. Typing `3` gives the `help` card. |
| 16 | Same Project, with test 7's `state.md` and `brief.md` in its knowledge. New chat: type `cecicela`, then `2` | It reads, never guesses: the plan's title, N of M done, gate jobs, the newest event, and any `feedback:` lines, each named by where it came from (the files, or the app's memory, quoted). It says it cannot read earlier chats unless the host gave it a search tool. It ends with resume, start fresh, or stop. With nothing in knowledge and no memory, it says so in one line and offers choice 1. |
| 17 | New chat. Type `optimize make our docs site better and get it live` | It names the protocol (ceci) in one sentence, asks at most three questions, then shows one rewritten prompt in a code block with every value you did not give marked `[assumed: ...]`, two to four bullets on why each change helps, and the choice **run it / edit it / keep mine**. It runs nothing until you choose. |
| 18 | At the end of test 7's plan (or any trouble verdict or cela review) | One line: "How did that land? 1 good · 2 adjust · 3 retry · 4 report". `2 fewer jobs` changes the same plan and says what changed, then asks again; `3` names a different approach and why; for ceci the answer lands in `state.md`'s `feedback:` list in your words. `4 the gate blinked twice` drafts a GitHub issue (title, what happened, expected, version, host, steps), shows it first, leaves out file contents and names, and gives a link to `github.com/actviteai/cecicela/issues/new`. It never files the issue itself. |
| 19 | In the player from test 8, press **B** (or click `[B]udget`) | A panel lists low, medium, and creator with one line each, marks the current one `[now]`, and says the drawing is free and the budget is how often the page is updated. Up/Down chooses; Enter copies `budget <level>`, and pasting it in the chat switches the budget (the reply confirms in one line). The bottom row ends with the newest event's minute and its age (`05:56Z 3m ago`); after each update the reply says `view: <done>/<total> done, as of ...` or `view not updated`, and the page never shows a job state the latest `state.md` does not have. |

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
| 12 prep questions on an attached plan | | | | |
| 13 help | | | | |
| 14 budget low / creator, honest steps | | | | |
| Instruction limit shown by host | | | | |
| Player surface (artifact / canvas / Studio / text) | | | | |
| Share action exists | n/a | org only | | |

A failure in tests 2, 3, 6, 9, 12, 13 or 14 is a protocol or router bug: fix it in `chat/src/` (chat rules) or `packages/<name>/skill/` (protocol text) in a worktree and pull request, run `npm run sync`, and re-upload. A failure in test 8 is usually the host's surface. Note it and check the fallback works.
