# rdap-q is now cela, part of ceciCela

This repository is archived. The RDAP-Q engine is now **cela**, developed in **[actviteai/cecicela](https://github.com/actviteai/cecicela)** with ceci and trouble: *ceci plans this, cela proves that, trouble fixes what breaks.*

```bash
npx --yes @actvite/cecicela install --all   # /ceci, /cela, and /trouble
npx --yes @actvite/cela install --all       # the same: ceciCela installs as one product
```

The rename is a clean break, with no aliases: the command is `/cela` (and `cela` on the shell), the project directory is `.cela/`, the home is `~/.cela` (`CELA_HOME`), and the NeMo package is `cela-nat` (`cela_nat`). The engine, its oracles, the `state.jsonl` format, and the memory records are unchanged; cela 1.0.0 is the 2.1.0 engine under its new name. <!-- keep-version -->

## Move to cela: delete and reinstall

1. Keep your memory, if you want it:

   ```bash
   mkdir -p ~/.cela && cp -R ~/.rdapq/memory ~/.rdapq/projects ~/.cela/
   ```

2. Delete the old skill from every harness (paths that do not exist are skipped), and the old global command if you installed one:

   ```bash
   rm -rf ~/.claude/skills/rdap-q ~/.claude/commands/rdapq.md \
          ~/.agents/skills/rdap-q ~/.grok/skills/rdap-q ~/.cline/skills/rdap-q \
          ~/.cursor/skills/rdap-q ~/.copilot/skills/rdap-q \
          ~/.gemini/antigravity-cli/skills/rdap-q ~/.gemini/config/skills/rdap-q \
          ~/.hermes/skills/software-development/rdap-q ~/.rdapq
   npm uninstall -g rdap-q @actvite/rdapq
   ```

3. Reinstall, then restart the agent session and type `/cela`:

   ```bash
   npx --yes @actvite/cecicela install --all
   ```

In a project where you ran `rdapq init`, also delete `.agents/skills/rdap-q/`, `.claude/commands/rdapq.md`, and `.clinerules/rdapq.md`; remove the RDAP-Q `Stop` hook from `.claude/settings.json` (it calls the deleted skill); and drop the RDAP-Q section from `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.goosehints`, `.grok/rules.md`, and `.github/copilot-instructions.md`. Existing `.rdapq/` directories are left alone; a new `cela start` (or `cela init`) begins a `.cela/` beside them.

`@actvite/rdapq` 2.1.0 was the last release under the old name; it has been removed from npm. The original unscoped `rdap-q` package is deprecated and stays installable. The eval baselines recorded under the old name stay in this archive; cela's own baseline is in `packages/cela/eval/results/` in ceciCela. <!-- keep-version -->

Issues and pull requests: [actviteai/cecicela](https://github.com/actviteai/cecicela/issues).
