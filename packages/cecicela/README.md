# @actvite/cecicela

> ceci plans this, cela proves that, trouble fixes what breaks.

Video: [ceciCela, explained](https://youtu.be/i5Ge36L_MTk) on the [actVite YouTube channel](https://www.youtube.com/channel/UCPlRHTUre-GPCK__77zI5IQ).

Installs the three ceciCela skills, and the `/cecicela` front door, into Claude Code, Grok, Codex, Cline, Goose, Cursor, GitHub Copilot, Google Antigravity, and Hermes Agent.

```bash
npx --yes @actvite/cecicela install --all
```

| Command | Does |
| --- | --- |
| `cecicela install [--all\|--<harness> ...] [--only ceci,cela,trouble] [--force]` | Installs the skills; with no harness named, all nine |
| `cecicela status` | Which skill is installed in which harness |
| `cecicela update` | Reinstalls into every harness that already has any of them |
| `cecicela --version` | The bundle version and the exact skill versions it carries |

Then restart the agent session and type `/ceci` (plan a goal as a job graph), `/cela` (prove a change with a tool-measured gate), or `/trouble` (debug what earlier attempts did not fix). Not sure which? `/cecicela` offers a start menu: start something new, review what the work dir and your agent's memory already hold, see every command (the help card), or improve your prompt before it runs. After each result it asks once how it landed (good, adjust, retry another way, or report a problem as a GitHub issue that you file), and `ceci feedback` keeps the answer with the plan. In Claude Code, plugin skills are namespaced: `/cecicela:ceci`, `/cecicela:cela`, `/cecicela:trouble`.

## Machine learning and XGBoost

ceciCela is a set of AI agent skills (`SKILL.md`) for coding agents, and it suits machine learning and MLOps work. Agents write training code quickly, but they often judge their own model changes. A leaked feature or a lucky seed then produces a score that looks like progress. ceciCela takes that judgement away from the model:

- `/ceci` writes the pipeline as a job graph before anything runs: split, features, training, evaluation against the baseline, and the report. `ceci resolve-gpu` picks a free GPU from your preference file and prints `CUDA_VISIBLE_DEVICES`.
- `/cela` accepts a data, feature, or model change only when the tests it runs pass. Each clause of the request must be covered by a named test, such as "holdout AUC is not below the baseline" or "the encoder is fit on training folds only". `cela check` refuses a fourth round, so an agent cannot keep re-tuning until a seed happens to pass.
- `/trouble` ranks the causes of a metric regression on verbatim evidence: leakage, a changed split, a new library default, or a seed.

For XGBoost:

1. Train with `xgb.XGBClassifier(device="cuda", tree_method="hist", random_state=0)` on the GPU ceci chose.
2. Write pytest gates that score a fixed holdout against a stored baseline, with a small tolerance because GPU `hist` training is not bit-for-bit repeatable, and that check for leakage.
3. Run `cela start --req ... --run "pytest -q tests"`, then `cela cover`, `cela check`, and `cela gate`. The gate exits 0 only on COMPLETE.

`cela export` turns past tasks into a labeled tabular dataset: the gate's verdict next to the reviewer's outcome. An XGBoost model is a natural first model for predicting which agent changes a reviewer will reject. The walkthrough is in the [repository README](https://github.com/actviteai/cecicela#machine-learning-and-xgboost).

The skills come from their own packages, pinned exactly: [`@actvite/ceci`](https://www.npmjs.com/package/@actvite/ceci), [`@actvite/cela`](https://www.npmjs.com/package/@actvite/cela), and [`@actvite/trouble`](https://www.npmjs.com/package/@actvite/trouble). Docs, the plugin marketplace, and the chat versions: [github.com/actviteai/cecicela](https://github.com/actviteai/cecicela).

GPL-3.0-or-later.
