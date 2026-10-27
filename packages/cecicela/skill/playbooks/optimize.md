# Improve my prompt

The user asked to tighten a request before it runs. The goal is a prompt the right skill can act on without guessing, and a user who sees why each part helps. Rewrite; never run it until the user says so.

## Steps

1. Take the request as the user wrote it. If there is none yet, ask for it in one line.
2. Pick the skill it belongs to (the Pick table in `SKILL.md`). Say which, in one sentence.
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

## Rules

- Add no facts. Anything you supplied rather than the user is marked `[assumed: ...]` inside the prompt, for the user to confirm or delete.
- Keep the user's words for the goal; tighten the structure, not the intent.
- One rewrite per turn. If the user edits it, show the whole new prompt again, not a diff.
- After the user runs it, ask for feedback on the result as `playbooks/feedback.md` says, not on the prompt.

## Example

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
