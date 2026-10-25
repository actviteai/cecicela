# Brand

The ceciCela mark is a one-colour engraved seal of a 16th-century French noblewoman, in the style of an engraved stamp. It is not generated yet.

## To do (workstream H)

1. Generate candidates from the top three prompts in `logo_prompts.md` (add that file here). Pick by how the simplified silhouette reads at 32 px.
2. Vectorise the chosen one: `seal.svg` (light) and `seal-dark.svg`.
3. Export the store set: `seal-32-outline.png` (white on transparent), and `seal-64.png`, `seal-192.png` (with padding), `seal-300.png`, `seal-512.png`, `seal-1024.png`, and `social-1280x640.png`.
4. Record the prompt, the model, and the date in `PROVENANCE.md`; stores ask for ownership confirmation.
5. Point `scripts/targets/chat.js` at `seal-192.png` and `seal-32-outline.png` for the Microsoft 365 icons, which are placeholders (a plain double ring) until then. Use the same mark for the GitHub org avatar and the README header.

The acceptance check: the 32 px outline is legible on a dark background.
