# rdap-q is now cela, part of ceciCela

This repository is archived. The RDAP-Q engine is now **cela**, developed in **[actviteai/cecicela](https://github.com/actviteai/cecicela)** with ceci and trouble: *ceci plans this, cela proves that, trouble fixes what breaks.*

```bash
npx --yes @actvite/cecicela install --all   # /ceci, /cela, and /trouble
npx --yes @actvite/cela install --all       # /cela alone
```

The rename is a clean break, with no aliases: the command is `/cela` (and `cela` on the shell), the project directory is `.cela/`, the home is `~/.cela` (`CELA_HOME`), and the NeMo package is `cela-nat` (`cela_nat`). The engine, its oracles, the `state.jsonl` format, and the memory records are unchanged; cela 1.0.0 is the 2.1.0 engine under its new name. <!-- keep-version -->

Existing `.rdapq/` directories in your projects are left alone; a new `cela start` (or `cela init`) begins a `.cela/` beside them. To keep your memory, copy `~/.rdapq/memory/` and `~/.rdapq/projects/` into `~/.cela/`.

`@actvite/rdapq` 2.1.0 was the last release under the old name and is deprecated, as is the original unscoped `rdap-q` package. The eval baselines recorded under the old name stay in this archive; cela's own baseline is in `packages/cela/eval/results/` in ceciCela. <!-- keep-version -->

Issues and pull requests: [actviteai/cecicela](https://github.com/actviteai/cecicela/issues).
