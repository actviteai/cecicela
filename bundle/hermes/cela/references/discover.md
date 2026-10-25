# Discover (full depth, before `start`)

Answer only the unknowns that can change the diff.

1. List the questions: which files, which interfaces, which commands prove it works, what could break.
2. Answer each from the repository first: code, tests, config, history (`git log -p -- <file>`). Use external docs only for behavior the repository cannot show, and record each such fact with `T claim ... --external --source <url>`.
3. Run a small experiment when reading cannot settle a question. Record what it showed with `T note assumption` or `T note decision`.
4. If a question needs the user (an ambiguous requirement, a product decision), ask before `start`. Do not guess and plan around the guess.
5. Decide the risk, the planned files, the test command, and the repro command. Then run `T start --depth full ...`.

For a change to interfaces, persistence, security, or concurrency, write one `T note decision` per choice: what you chose, the alternative you rejected, and why.
