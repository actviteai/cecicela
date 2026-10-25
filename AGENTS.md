# ceciCela: agent instructions

This repository is the ceciCela monorepo: `@actvite/ceci`, `@actvite/cela`, `@actvite/trouble`, the `@actvite/cecicela` bundle, and the private shared core. Read [README.md](README.md) for the layout.

## Before you change anything

- Sources: `packages/core/lib/`, `packages/<pkg>/` (except `lib/core/` and `LICENSE`), `chat/src/`, `scripts/`, `test/`, `docs/`.
- Generated, never edited by hand: `packages/<pkg>/lib/core/`, `packages/<pkg>/LICENSE`, `packages/ceci/skill/tool/tui.js`, `bundle/`, `chat/pack/`, `chat/claude/`, `chat/chatgpt/`, `chat/grok/`, `chat/m365/`, and the catalogs `.claude-plugin/`, `.github/plugin/`, `.grok-plugin/`, `.agents/plugins/`.
- After changing a source, run `npm run sync`. `npm test` fails while anything generated is stale.
- Never edit a version by hand outside a `package.json`; `npm run stamp` writes it everywhere it repeats. A line that must name another version ends with `<!-- keep-version -->`.
- Node only, no third-party dependencies. The one exception is the optional Python package `packages/cela/nemo`.
- Never publish to npm. `npm run release` stages and writes `dist/release-plan.md`; a maintainer publishes by hand.

## Skills in this repository

When the user types `/ceci`, `/cela`, or `/trouble`, read that skill (`packages/<name>/skill/SKILL.md`) and follow it for that task only. The repository commits no `.claude/`, `.agents/skills/`, `.grok/`, `.cline/`, or `.goose/` folder; harnesses load the skills from the user skill directories `cecicela install` writes, or from this marketplace.

## Git

**Do not write or commit directly to `main`.** For every task, create a new branch and a new linked worktree under `.worktrees/`, starting from the latest `origin/main`. Edit and commit there, push the branch, open a pull request targeting `main`, and merge it. Then fast-forward the primary checkout and remove the clean worktree and the local branch. Never force-remove a dirty worktree or delete an unmerged branch.

```bash
git fetch origin
git worktree add -b <type>/<task> .worktrees/<task> origin/main
cd .worktrees/<task>
# edit, npm run sync, npm test
git add <task-files>
git commit -m "<message>"
git push -u origin HEAD
gh pr create --base main --head <type>/<task>
gh pr merge --merge
```

## GitHub account

This repository belongs to the `actviteai` GitHub account. Every push, pull request, and merge must come from `actviteai`.

- `origin` is `https://actviteai@github.com/...`, and a repo-local credential helper supplies actviteai's token. Do not change the remote or the credential config, and do not run `gh auth switch`.
- Prefix `gh` commands with `GH_TOKEN=$(gh auth token --user actviteai)`. The `.envrc` sets this for interactive shells, but agent shells do not load direnv.
- If a push or `gh` command fails on authentication, stop and tell the user. Do not work around it with another account.
