# Feedback

A result is only finished when the user is happy with it, or has a clear way to get there. Ask once per result, act on the answer, and keep it with the plan so the next run starts from it.

## When

After a result: a ceci run that hands back (a gate, the deadline, or no ready jobs left), a trouble verdict (a fix proposed, or the incident closed), a cela review or gate, an improved prompt that was run. Not mid-run, not in an unattended run, and never twice for the same result.

## Ask

One line, with the host's question tool when there is one:

> How did that land? **1 good** · **2 adjust** (say what) · **3 retry** another way · **4 report** a problem with ceciCela

## Act

| Answer | Do |
| --- | --- |
| good | Record it and carry on. |
| adjust | Restate the change in one line ("fewer jobs, and no paid tools"), apply it to the same result, show what changed, and ask again. For ceci, edit the jobs or `brief.md` and say which. |
| retry | Name a different approach from the one that just ran, say in one line why it may land better, and run it. Never rerun the same thing and call it a retry. |
| report | Build the GitHub issue below. |

Never argue with the verdict, and never record words the user did not say.

## Record

- **ceci with a work dir:** `node <ceci skill>/tool/ceci.js feedback --work-dir <dir> --verdict good|adjust|retry|report [--job <id>] --note "<the user's words>"`. It appends a dated line to `feedback:` at the end of `state.md`. `ceci prep` shows the newest three, and the next run starts from them: "Last time you said: <note>. This run <what changes>."
- **ceci in a chat:** append the same line to the `feedback:` list at the end of the `state.md` you hand back: `"<YYYY-MM-DD> <verdict>[ <job>]: <the user's words>"` (the date only if you know it; otherwise leave it out).
- **trouble and cela:** keep it in the reply. When a ceci plan is open for the same work, record it there too.

## Report a problem with ceciCela

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
