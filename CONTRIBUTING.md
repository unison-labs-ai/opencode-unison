# Contributing to opencode-unison

Thanks for helping improve persistent memory for OpenCode agents.

## Repo layout

Single-package TypeScript plugin. Source in `src/`, output in `dist/`.

```
src/
  index.ts           # Plugin entry point (UnisonPlugin export)
  cli.ts             # opencode-unison CLI (install / login / status / logout)
  config.ts          # Config loading (env > config file > credentials)
  types/index.ts     # Shared types
  services/          # auth, brain client, compaction, context, privacy, tags, logging
```

## Development

```bash
bun install
bun run build       # bundles dist/ (index.js + cli.js) and emits .d.ts declarations
bun run typecheck   # tsc --noEmit, checks without emitting
```

Local install into OpenCode:

```jsonc
// ~/.config/opencode/opencode.jsonc
{
  "plugin": ["file:///path/to/opencode-unison"]
}
```

Then restart OpenCode and run `bunx opencode-unison@latest status` (or point at the
local binary) to verify.

## Before opening a PR

1. `bun run build` must pass.
2. `bun run typecheck` must pass.
3. Keep changes scoped — one logical change per PR.
4. Conventional commit messages: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`.
5. Never commit `.env`, credential files, or real `usk_...` tokens.

## Conventions

- TypeScript, ESM. Match the formatting style of surrounding code.
- No new runtime dependencies without discussion — the plugin ships to users who
  `bunx` it; keep the install fast and the supply chain short.
- The brain is the security boundary. Don't add client-side scope or path validation.
- Never log or store a `usk_` key outside `~/.unison-opencode/credentials.json`
  (mode 0600).

## Reporting bugs / proposing features

Use the issue templates. For security issues, see [`SECURITY.md`](./SECURITY.md) —
do **not** open a public issue.
