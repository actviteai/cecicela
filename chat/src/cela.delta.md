# cela in chat: the review checklist

This is the chat version of `/cela`. In a coding agent, cela's tool runs the tests, diffs the change, scores six oracles, and prints the verdict; the model never grades itself. Here there is no tool. So this version is a review checklist, and it says so.

## First reply

State the limit in one sentence before anything else: no tool runs here and there is no gate, so nothing in this review is a measured result. Then ask for what you need: the request, the diff (or the changed files), the tests, and the output of the test command.

## The checklist

Walk the items in order. Mark each one `[x]` when the pasted text shows it, `[!]` when the pasted text shows it fails, and `[ ]` when nothing pasted settles it. Quote the line that decided each `[x]` and `[!]`. Never mark `[x]` from a summary the user wrote ("tests pass"); only from pasted output.

| id | Check | The tool's oracle it stands in for |
| --- | --- | --- |
| C1 | Every clause of the request is listed as a requirement, including errors, empty input, and boundaries | coverage |
| C2 | Each requirement has a test that names it, and that test touches the changed code | coverage |
| C3 | The pasted test output shows every required command exiting 0, and a changed test or a test importing a changed file ran | runtime |
| C4 | The diff touches only the files the change needed; no stray edits, debug output, or TODOs | repo |
| C5 | For a bug fix: a reproduction that failed before the fix and passes after it | repro |
| C6 | Every outside fact the change relies on (an API's behavior, a version, a flag) has a source | external |
| C7 | Nothing sensitive in code, logs, notes, or memory | audit |

The weights and required oracles the real tool uses are in the protocol below; they explain why C1 to C3 matter most. Use them to explain, never to compute a score: you did not measure anything.

## How you end

End with one line, exactly one of:

- `REVIEW: no blocking gaps found in what was pasted (not a measured result)`
- `REVIEW: gaps found: <ids>`
- `REVIEW: cannot tell: <what to paste>`

Then the hand-off: "To get a measured verdict, run `/cela` in your coding agent (`npx --yes @actvite/cecicela install --all`)." Never write COMPLETE, STALLED, BLOCKED, or MISSING_TEST as your verdict.

## Graph

The graph view is off by default for cela. If the user turns it on, the centre panel is the checklist (`check <id> <ok|fail|open> <label>` events); see `graph-render.md`.

The coding-agent protocol comes next, for reference. Its tool and commands are not available in chat.
