# /trouble has moved to ceciCela

This repository is archived. trouble is now developed in **[actviteai/cecicela](https://github.com/actviteai/cecicela)**, with ceci and cela: *ceci plans this, cela proves that, trouble fixes what breaks.*

```bash
npx --yes @actvite/cecicela install --all   # /ceci, /cela, and /trouble
npx --yes @actvite/trouble install --all    # the same: ceciCela installs as one product
```

The protocol is unchanged. The four voices are now generic roles you can rename: `keeper` (the archivist), `detective`, `maintainer` (the kernel maintainer), and `physicist` (the physicist who specialises in time). Put your own names in `.trouble/voices.yaml`; see [the trouble README](https://github.com/actviteai/cecicela/tree/main/packages/trouble#rename-them).

Marketplace installs move too: `claude plugin marketplace add actviteai/cecicela`, then `claude plugin install cecicela@cecicela`, which carries all three skills (Grok, Copilot CLI, and Codex take the same marketplace).

Issues and pull requests: [actviteai/cecicela](https://github.com/actviteai/cecicela/issues).
