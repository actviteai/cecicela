# Worked run: trouble in chat

**User:** After every deploy, about one in five users sees the old page for ten minutes. We purge the CDN. Nothing fixes it.

**Assistant:**

Using the four-minds debug protocol

Untooled mode: I can't read your files or run commands here, so I'll ask for evidence, cap confidence at 6, and the incident stays open until you run the check.

mode: untooled. Evidence so far, quoted from you: E1 "about one in five users sees the old page for ten minutes"; E2 "We purge the CDN."

The archivist: E1 is a ratio and a duration, both specific; E2 is an action, not an observed result, so it is [UNVERIFIED] that the purge took effect.

The detective: one in five suggests one of five of something serves stale content: an edge, a replica, a worker.

The kernel maintainer: no refactor until we know which; the cheapest check is a header.

The physicist who specialises in time: ten minutes is a TTL, not a race. Something cached the old page after the purge, or was never purged.

| H | claim | prior | P(E given H) | posterior |
| --- | --- | --- | --- | --- |
| H1 | a stale edge cache outside the purge scope | 0.4 | 0.8 | 0.604 |
| H2 | two writers on session state | 0.3 | 0.5 | 0.283 |
| H3 | wrong env var in staging | 0.3 | 0.2 | 0.113 |

```text
h H1 0.604 stale edge cache after deploy
h H2 0.283 two writers on session state
h H3 0.113 wrong env var in staging
```

EVIDENCE_REQUEST: run `curl -sI https://<your-site>/ | grep -i -E 'age|cache|x-served-by'` five times right after a deploy and paste all five.

GATE: keeper yes 6, detective no 5 (want the headers first), maintainer yes 6, physicist yes 6. Distill: no fix until the headers are in.

```text
TROUBLE_VERDICT_BEGIN
mode: untooled
root_cause: not yet known; H1 leads at 0.604 (E1, E2)
evidence_quoted: 2
proposed_fix: purge with the edge-specific API for every POP; verify with the curl above
fix_applied: no
verified_by: not verified
confidence: 5/10
INCIDENT_RESOLVED=no
TROUBLE_VERDICT_END
```
