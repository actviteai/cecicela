# ceciCela for ChatGPT: setup

There are two routes: a Project for yourself, or the published GPT.

## A Project (any plan with Projects)

1. Create a Project named **ceciCela**.
2. Paste `INSTRUCTIONS.md` into the Project's instructions.
3. Upload every file in `knowledge/` and `graph-player.html` as Project files.
4. When the graph is on, ChatGPT builds the player once in a canvas and edits it in place each turn. Where canvas is not offered, it falls back to the text screen.

## The ceciCela GPT (publisher steps)

Creating and publishing GPTs needs a workspace that allows it (Business, Enterprise, or Edu, as of this pack's build).

1. In the actvite.com workspace, verify the `actvite.com` domain on the builder profile.
2. Create a GPT. Copy the name, description, and conversation starters from `listing.md`.
3. Paste `INSTRUCTIONS.md` into Instructions (it is under the 8,000-character limit; the build checks).
4. Upload every file in `knowledge/` and `graph-player.html` as Knowledge. Enable Canvas and Code Interpreter.
5. Share → GPT Store, category Programming. Fix anything the policy check flags.
6. Re-publish after every `npm run chat:build` release.

A GPT has no Project knowledge the user can write to: users attach their latest `state.md` at the start of a session to continue a plan.
