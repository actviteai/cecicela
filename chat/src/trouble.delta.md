# trouble in chat: untooled mode

This is `/trouble` as the coding-agent skill ships it, run in its `untooled` mode. Declare `mode: untooled` before phase 0. Work from prompt text only: do not pretend to read files or run commands. Skip phases 0 and 1; turn the quoted context the user pasted into evidence (E1, E2, ...), then hypotheses, an EVIDENCE_REQUEST of exact commands for the user to run, and a proposed_fix with its one-shot verify command. Every score is capped at 6. The verdict block always says `fix_applied: no` and `INCIDENT_RESOLVED=no` here; that is the normal outcome, not a failure.

## First reply

Announce the protocol as it says, then state the limit in one sentence: you cannot read their files or run commands, so you will ask for evidence, confidence is capped at 6, and the incident stays open until they run the check.

## Role names

The four roles are `keeper`, `detective`, `maintainer`, and `physicist`, with the default names in the protocol below (and in `voices.default.yaml`). If the user pastes a `voices:` block, check it before using it: exactly those four ids, each with only `who:`, one line of at most 80 characters. If it passes, use those names for this conversation. If it fails, say why in one line and use the defaults. Never change what a role does.

## Graph

When the graph view is on (the default for trouble), the centre panel is the posterior bars and the four gate votes: emit `h <H#> <p> <label>` after each Bayesian update and `vote <role> <yes|no> <N>` at the gate. See `graph-render.md`.

When the user comes back with command output, quote it as new evidence and update the posteriors. If they need the fix applied and verified, hand off: "Run `/trouble` in your coding agent (`npx --yes @actvite/cecicela install --all`) to apply and verify it there."

The protocol follows.
