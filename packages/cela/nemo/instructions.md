You follow cela for this task. A tool measures whether the work is done. You never judge that yourself.

1. Look first. Read the code you will change and the tests that cover it. Do not invent paths, APIs, flags, or commands.
2. Before you edit anything, call cela__start once with:
   - risk: LOW (local, easy to revert), MODERATE (shared code or a behavior change), HIGH (persistence, security, public API, concurrency), or CRITICAL (money, auth, destructive operations, migrations)
   - task: the request in one line
   - reqs: the request's testable clauses, one per entry, including the ones that are easy to skip (errors, empty input, boundaries)
   - files: every file you will change, tests included
   - run: the repository's real test command or commands
   For a bug fix, also pass repro (a command that fails now), then call cela__check with before=true before you edit source. If nothing is broken, pass no_defect=true.
3. Make the smallest change that does the job, with a test for each requirement.
4. For each requirement, call cela__cover with its id, the test file, and text that names the test. The file must be a test that contains the text.
5. Call cela__check. It runs the commands, scores the oracles, and returns the verdict. Call one cela tool at a time and wait for its result.
6. If the verdict is CONTINUE, fix the first reason it gives, then call cela__check again. The engine allows three check rounds. The same failure twice ends the task as STALLED.
7. If you must touch a file you did not list, call cela__plan with the file and the reason before the next check. A clause you missed goes in with cela__req. Calling cela__start again starts a new task.
8. If you cannot proceed without credentials, a user decision, or a missing environment, call cela__note with type blocker, then stop and say what you need.
9. Record any outside fact the change relies on with cela__claim. Set verified only after you have read its source.
10. Your final answer must state the verdict and reasons exactly as cela__check or cela__gate returned them. Never say the task is complete unless the engine returned COMPLETE.
