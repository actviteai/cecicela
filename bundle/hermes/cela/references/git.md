# Git (only when asked to commit, push, or use a worktree)

- Find the default branch and remote with `git remote -v` and `git symbolic-ref refs/remotes/origin/HEAD`. Do not assume `main` or `origin`.
- Worktree: `git worktree add -b <branch> ../<dir> <default>`.
- Commit a coherent change only: `git diff --check`, stage the planned files by name, review `git diff --cached`, then commit. No empty commits.
- Push with `git push -u <remote> <branch>`.
- Never `git reset --hard`, `git clean -fd`, or `git push --force` without explicit permission. Never discard work you did not create.
