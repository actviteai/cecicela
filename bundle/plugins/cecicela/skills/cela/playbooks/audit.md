# Audit (full depth, or `/cela audit`, before you report)

Try to prove the task is not done. Check each item against the diff (`git diff <base>`) and the last `T check`:

- The requirement: re-read the task. Does the change do what was asked, not a nearby thing?
- Unexercised paths: error branches, empty input, boundaries. Is each one covered by a test that ran?
- Regressions: did any existing behavior change that the task did not ask to change?
- Claims: is every external fact recorded and verified, or honestly marked unverified?
- Scope: no unrelated edits, debug output, TODOs, or new dependencies you did not need.
- Secrets: nothing sensitive in code, logs, notes, or memory.

Fix what you find, then `T check` and `T gate` again. Report the gate's verdict, not your own.
