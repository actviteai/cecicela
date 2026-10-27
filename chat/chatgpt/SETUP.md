# ceciCela for ChatGPT: setup

Use a ChatGPT **Project**. That is the route for everyone, on every plan that has Projects.

OpenAI is retiring custom GPTs on **11 December 2026** (11 February 2027 for Enterprise workspaces with an approved deferral), and creating new GPTs is closing ahead of that. Their replacement is **plugins**: a GPT's instructions become a skill and its knowledge files become reference files. Do not build a new ceciCela GPT. A public ceciCela plugin follows once OpenAI's plugin submission is open; until then this kit is the ChatGPT route. Check https://help.openai.com/en/articles/20001519-custom-gpt-retirement-and-migration-faq before each release.

## Build the Project

1. Create a Project named **ceciCela**.
2. Open the Project's settings and paste the whole of `INSTRUCTIONS.md` into its instructions.
3. Add the files. ChatGPT takes at most 10 files per upload, so add them in two batches.
   - Go, Plus, and higher plans: every file in `knowledge/` (including the four in `knowledge/examples/`) plus `graph-player.html`, 13 files.
   - Free (5 files per Project): `trouble.chat.md`, `ceci.chat.md`, `cela.chat.md`, `graph-render.md`, `graph-player.html`. The defaults for trouble's roles are in `trouble.chat.md`, so `voices.default.yaml` is optional. `help.md` and `cecicela.chat.md` do not fit; without them, `help` gets a shorter answer from the router, and the start menu, `optimize`, and feedback follow the router's short version.
4. Start a chat inside the Project. The first reply states its limits.

When you choose the live player (ceci's start question, or typing `animate`), ChatGPT builds it once in a canvas and edits it in place each turn. Where canvas is not offered, it falls back to the text screen. Type `help` in any chat for the commands.

To continue a ceci plan later, replace `state.md` in the Project's files with the latest copy ChatGPT gave you, or attach it to the new chat.

The full product, with the tools these chat versions only describe: `npx --yes @actvite/cecicela install --all`
