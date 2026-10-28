# @actvite/cecicela

> ceci plans this, cela proves that, trouble fixes what breaks.

Video: [ceciCela, explained](https://youtu.be/i5Ge36L_MTk) on the [actVite YouTube channel](https://www.youtube.com/channel/UCPlRHTUre-GPCK__77zI5IQ).

ceciCela is a set of open-source **AI agent skills** (`SKILL.md`) for coding agents. This package installs all three skills, `/ceci`, `/cela`, and `/trouble`, and the `/cecicela` front door into Claude Code, Grok, Codex, Cline, Goose, Cursor, GitHub Copilot, Google Antigravity, and Hermes Agent.

```bash
npx --yes @actvite/cecicela install --all
```

| Command | Does |
| --- | --- |
| `cecicela install [--all\|--<harness> ...] [--force]` | Installs the three skills and the front door; with no harness named, into all nine |
| `cecicela status` | Which skill is installed in which harness |
| `cecicela update [--force]` | Reinstalls all of ceciCela into every harness that has any part of it |
| `cecicela --version` | The bundle version and the exact skill versions it carries |

**ceciCela installs as one product.** `npx --yes @actvite/ceci install`, `@actvite/cela install`, and `@actvite/trouble install` hand off to this package and install all of it. The plugin marketplace at [github.com/actviteai/cecicela](https://github.com/actviteai/cecicela) lists only the `cecicela` plugin.

Then restart the agent session and type `/ceci` (plan a goal as a job graph), `/cela` (prove a change with a tool-measured gate), or `/trouble` (debug what earlier attempts did not fix). Not sure which? `/cecicela` offers a start menu: start something new, review what the work dir and your agent's memory already hold, see every command (the help card), or improve your prompt before it runs. After each result it asks once how it landed (good, adjust, retry another way, or report a problem as a GitHub issue that you file), and `ceci feedback` keeps the answer with the plan. In Claude Code, plugin skills are namespaced: `/cecicela:ceci`, `/cecicela:cela`, `/cecicela:trouble`.

## Machine learning advantages

Agents write training code quickly, but they often judge their own model changes. A leaked feature or a lucky seed then produces a score that looks like progress. ceciCela takes that judgement away from the model:

- **`/ceci` plans the pipeline** as a job graph before anything runs: split, features, training, evaluation against the baseline, and the report. Every job that changes code, data, or a model goes through `/cela`.
- **`/cela` decides when a model change is done.** It accepts a data, feature, or hyperparameter change only when the tests it runs pass, and each clause of the request ("holdout AUC is not below the baseline") must be covered by a named test.
- **The round limit stops endless tuning.** `cela check` refuses a fourth round, so an agent cannot keep re-tuning until a seed happens to pass.
- **Every experiment leaves a record**: the exact diff each check measured, every command and exit code, and every verdict, on disk.
- **`/trouble` debugs regressions**, ranking causes such as leakage, a changed split, a new library default, or a seed on verbatim evidence.
- **GPU jobs are placed from your own file.** `ceci resolve-gpu` picks a free device and prints `CUDA_VISIBLE_DEVICES`.
- **People decide what leaves the building.** ceci stops for a human before anything is posted, sent, paid for, or priced.

## XGBoost with ceciCela

**Why it fits.** XGBoost trains tabular models in seconds to minutes, so a gate can retrain and score it inside a test on every check. With `tree_method="hist"`, a fixed `random_state`, and a fixed holdout, results repeat closely enough to compare against a stored baseline. Its metrics, `best_iteration`, and gain importance are plain numbers a test can assert. A leaked feature often shows up as one feature carrying most of the gain. `device="cuda"` honours the `CUDA_VISIBLE_DEVICES` that ceci prints, so training jobs do not share a GPU by accident.

**How to use it.**

1. Type `/cecicela` and describe the goal. A pipeline goes to `/ceci`, one model change to `/cela`, and an unexplained metric drop to `/trouble`.
2. ceci places the training job with `ceci resolve-gpu --model xgb-hist` and exports `CUDA_VISIBLE_DEVICES` for it.
3. Write the gate as a pytest file. Train `xgb.XGBClassifier(tree_method="hist", device=DEVICE, random_state=0)` on the fixed split, and assert that holdout AUC is at least the stored baseline minus a small tolerance, because GPU `hist` training is not bit-for-bit repeatable. Add a leakage test.
4. Run `cela start --req "holdout AUC is not below the stored baseline" --run "pytest -q tests" ...`, then `cela cover`, `cela check`, and `cela gate`. The gate exits 0 only on COMPLETE.
5. `cela export --out tasks.jsonl` turns past tasks into a labeled tabular dataset, with the gate's verdict next to the reviewer's outcome. An XGBoost classifier is a natural first model for predicting which agent changes a reviewer will reject.

The full walkthrough, with the test file, is in the [repository README](https://github.com/actviteai/cecicela#xgboost-with-cecicela).

The skills come from their own packages, pinned exactly: [`@actvite/ceci`](https://www.npmjs.com/package/@actvite/ceci), [`@actvite/cela`](https://www.npmjs.com/package/@actvite/cela), and [`@actvite/trouble`](https://www.npmjs.com/package/@actvite/trouble). Docs, the plugin marketplace, and the chat versions: [github.com/actviteai/cecicela](https://github.com/actviteai/cecicela).

**Keywords:** AI agent skills, agent skills, SKILL.md, Claude Code skills, Codex skills, Cursor skills, GitHub Copilot, LLM agents, agentic AI, agentic workflows, human-in-the-loop, quality gates, evals, AI code verification, root-cause analysis, debugging, machine learning, MLOps, model evaluation, XGBoost, gradient boosting, tabular data, data leakage, GPU scheduling, CUDA, NVIDIA NeMo Agent Toolkit.

GPL-3.0-or-later.
