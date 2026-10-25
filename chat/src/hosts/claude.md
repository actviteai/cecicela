# ceciCela for Claude Projects: setup

Claude Projects hold custom instructions (always in context) and project knowledge (files Claude reads). Projects are shared only inside a Team or Enterprise organization, so this kit is how anyone else sets one up.

1. In Claude, create a Project named **ceciCela**.
2. Paste the whole of `INSTRUCTIONS.md` into the Project's custom instructions.
3. Add every file in `knowledge/` to the Project's knowledge: `ceci.chat.md`, `cela.chat.md`, `trouble.chat.md`, `graph-render.md`, `voices.default.yaml`, `state.example.md`, and `examples/`.
4. Add `graph-player.html` to knowledge too. When the graph is on, Claude builds it once as an artifact and then edits that artifact each turn, appending one event line.
5. Start a chat in the Project. The first reply states its limits.

To continue a ceci plan in a new chat, replace `state.md` in the Project's knowledge with the latest copy Claude gave you (the "sync step"), or attach it.

To publish the demo, open `graph-player.html` as an artifact and publish it from the artifact menu.
