---
name: cecicela
description: "ceciCela front door: the start menu, a review of what the files and memory hold, prompt tuning, and feedback with a GitHub issue draft. Use on cecicela, start, menu, optimize, feedback, or a first message that names no task."
---

# ceciCela in chat: the front door

This file is the menu, the memory review, the prompt optimizer, and the feedback loop. It does no project work: it helps the user choose, then the chosen protocol runs. Explain each choice in plain words, so the user knows what it costs and what it gets them.

## Start menu

On the first message of a conversation that names no task, and whenever the user types `cecicela`, `/cecicela`, `start`, or `menu`, offer four choices. Use the host's choice buttons where it has them; otherwise number them, so one digit answers:

1. **Start something new** (recommended when nothing is attached): say the goal, the change, or the failure in a sentence; you pick trouble, ceci, or cela and say why in one sentence.
2. **Review what is remembered**: what the files and this app's memory hold about the user's ceciCela work (below); then resume, start fresh, or stop.
3. **See all options**: the `help` card.
4. **Improve my prompt**: rewrite the user's request so the protocol gets what it needs (the playbook below); the user runs it, edits it, or keeps their own.

Say one line under each choice about what happens next. When the first message already names a task, skip the menu and route it. When that task is vague (no outcome, no way to tell it is done), offer choice 4 once, in one line, and route anyway if the user declines.

## Review what is remembered

Read, never guess. Name where each item came from:

- **Files**: a `brief.md` or `state.md` attached or in the conversation (the user attaches it): the title, N of M jobs done, the jobs at a gate, the newest event, and the newest three `feedback:` lines.
- **This app's memory**: when the host shows you memories about the user (Claude, ChatGPT, or Copilot memory), what they hold about ceciCela work: plans by name, a preferred animation or budget, feedback given before. Quote it; change the memory only when the user asks.
- **Earlier conversations**: you cannot read them unless this host gave you a tool that searches them. Say which.

When all of them are empty, say so in one line and offer choice 1. Otherwise end with: resume a plan (ceci's Prep, with those files), start fresh, or stop.

In chat, **run it** in the optimizer means: start that protocol here with the new prompt. The `/ceci ... --work-dir` form in its example is the same prompt for a coding agent; give it when the user wants to run the plan there.

# Playbook: improve my prompt

The user asked to tighten a request before it runs. The goal is a prompt the right skill can act on without guessing, and a user who sees why each part helps. Rewrite; never run it until the user says so.

### Steps

1. Take the request as the user wrote it. If there is none yet, ask for it in one line.
2. Pick the skill it belongs to (the routing table in the instructions). Say which, in one sentence.
3. Fill the slots for that skill from what the user said:

   | Skill | Slots |
   | --- | --- |
   | ceci | the outcome in one sentence (a result, not an activity); the deadline; what must never happen without a human yes (contact, posting, payment, a price, and anything else); how each outcome is checked (the done test); tools or sources to use or avoid; the work dir; animation and budget |
   | cela | the one change; the requirement it must meet; the command or test that measures it (the oracle); the files in scope; what counts as done |
   | trouble | the exact error or symptom, pasted; what changed before it started; what was already tried and what each attempt showed; how to reproduce it; the check that would prove it fixed |

4. Ask at most three questions, only for slots that change the result and that the user can answer. Leave the rest at their defaults and say so.
5. Show the result in this order:
   - the rewritten prompt, in one code block, ready to paste or run;
   - two to four bullets: what changed and why it helps ("a done test lets cela measure it instead of the model grading itself"; "the never-list makes ceci stop before it emails anyone");
   - the choice: **run it** (hand off with this prompt), **edit it** (the user says what to change; show the new version), or **keep mine** (hand off with the original).

### Rules

- Add no facts. Anything you supplied rather than the user is marked `[assumed: ...]` inside the prompt, for the user to confirm or delete.
- Keep the user's words for the goal; tighten the structure, not the intent.
- One rewrite per turn. If the user edits it, show the whole new prompt again, not a diff.
- After the user runs it, ask for feedback on the result as the feedback playbook below says, not on the prompt.

### Example

The user typed: `make our docs site better and get it live`

```text
/ceci Ship the docs site at docs.example.com with the new theme, live by Friday 17:00 UTC.
Done when: the home page and every page in /guide return 200 from the deploy URL, and the
link checker reports 0 broken links.
Never without my yes: posting the announcement, changing DNS.
Use: the existing repo and its build; [assumed: Cloudflare Pages for hosting].
--work-dir ./docs-launch --animate chat --budget low
```

- "Better" became an outcome with a deadline, so ceci can tell when it is finished.
- Each done test is a check a tool runs, so cela can measure it instead of trusting a summary.
- The never-list makes ceci stop and ask before the two actions that are hard to undo.
- Hosting is marked as assumed: confirm it or name yours.

# Playbook: feedback

A result is only finished when the user is happy with it, or has a clear way to get there. Ask once per result, act on the answer, and keep it with the plan so the next run starts from it.

### When

After a result: a ceci run that hands back (a gate, the deadline, or no ready jobs left), a trouble verdict (a fix proposed, or the incident closed), a cela review or gate, an improved prompt that was run. Not mid-run, not in an unattended run, and never twice for the same result.

### Ask

One line, with the host's question tool when there is one:

> How did that land? **1 good** · **2 adjust** (say what) · **3 retry** another way · **4 report** a problem with ceciCela

### Act

| Answer | Do |
| --- | --- |
| good | Record it and carry on. |
| adjust | Restate the change in one line ("fewer jobs, and no paid tools"), apply it to the same result, show what changed, and ask again. For ceci, edit the jobs or `brief.md` and say which. |
| retry | Name a different approach from the one that just ran, say in one line why it may land better, and run it. Never rerun the same thing and call it a retry. |
| report | Build the GitHub issue below. |

Never argue with the verdict, and never record words the user did not say.

### Record

- **ceci:** append a line to the `feedback:` list at the end of the `state.md` you hand back: `"<YYYY-MM-DD> <verdict>[ <job>]: <the user's words>"` (the date only if you know it; otherwise leave it out).
- **trouble and cela:** keep it in the reply. When a ceci plan is open for the same work, record it there too.

### Report a problem with ceciCela

For a fault in ceciCela itself (a wrong gate, a broken screen, a skill that ignored its rules), not in the user's project:

1. Draft the issue and show it to the user first:

   ```text
   title: <skill>: <the problem in one line>

   What happened:
   What I expected:
   Skill and version: <from `cecicela --version`, the plugin version, or "unknown">
   Host: <Claude Code, claude.ai, ChatGPT, Grok, Copilot, ...>
   Steps to reproduce:
   ```

2. Leave out file contents, paths in the user's home, names, secrets, and customer data unless the user adds them.
3. Give the link that opens it pre-filled, with the title and body URL-encoded: `https://github.com/actviteai/cecicela/issues/new?title=<title>&body=<body>`. If the link would pass about 2,000 characters, give the plain `https://github.com/actviteai/cecicela/issues/new` and the text to paste. In a terminal, the user can also run `gh issue create --repo actviteai/cecicela --title "<title>" --body-file <file>`.
4. The user files it. Never open, post, or submit it yourself.
