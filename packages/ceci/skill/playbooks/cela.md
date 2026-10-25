# cela gate

Call `/cela` when a job changes code, data, a pipeline, or a model, including a scoring job. Do not call it for a human gate. Do not replace its oracles, and do not grade the job yourself.

The harness loads `/cela` from the sibling skill `cela`; ceciCela installs both together. If the engine is on `PATH` as `cela`, `cela gate` is that same call. Do not hardcode a filesystem path, a host, or a project.

## Store the result

Copy the terminal token the gate prints. That token is the exact value of `cela_gate`:

- `COMPLETE`
- `STALLED`
- `BLOCKED`
- `MISSING_TEST`

`COMPLETE` is the only accepted terminal state. The job may become `done` only when the token is `COMPLETE`, the done test passed, and the artifact exists.

`STALLED`, `BLOCKED`, and `MISSING_TEST` stay not done. Record the token and stop that job. `CONTINUE` is not terminal; run the loop again rather than storing it. A token outside the four values is not stored. Leave `cela_gate: null` and do not mark the job done.

The gate's wording is not rewritten and not shortened into a different token.

## Event line

While the gate runs, the job's event is `<job> running cela:pending`. When it ends, `<job> done cela:ok` for COMPLETE, or `<job> blocked cela:stalled`, `cela:blocked`, or `cela:missing_test` for the others.
