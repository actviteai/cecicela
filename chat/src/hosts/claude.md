# ceciCela for Claude Projects: setup

Claude Projects hold project instructions (always in context) and project knowledge (files Claude reads). Projects work on every Claude plan, Free included (Free allows up to five Projects). They are shared only inside a Team or Enterprise organization, so this kit is how anyone else sets one up.

1. In Claude, create a Project named **ceciCela**.
2. Choose **Set project instructions** and paste the whole of `INSTRUCTIONS.md`.
3. With the **+** button in the Project's knowledge, add these files one by one (folders do not upload):
   - `knowledge/ceci.chat.md`, `knowledge/cela.chat.md`, `knowledge/trouble.chat.md`
   - `knowledge/graph-render.md`, `knowledge/state.example.md`, `knowledge/voices.default.yaml`
   - `knowledge/examples/ceci.md`, `cela.md`, `trouble.md`, `graph-frames.md`
   - `graph-player.html`

   If Claude refuses `voices.default.yaml`, rename the copy you upload to `voices.default.yaml.txt`.
4. Start a chat in the Project. The first reply states its limits.

When the graph is on, Claude builds the player once as an artifact and then edits that artifact each turn, appending one event line. The player asks for JetBrains Mono from Cloudflare's cdnjs; where the artifact blocks it, the system monospace takes over and the screen is the same.

To continue a ceci plan in a new chat, replace `state.md` in the Project's knowledge with the latest copy Claude gave you (the "sync step"), or attach it.

To publish the demo, open `graph-player.html` as an artifact and publish it from the artifact menu.

The full product, with the tools these chat versions only describe: `npx --yes @actvite/cecicela install --all`
