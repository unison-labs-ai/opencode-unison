# AGENTS.md

Guidance for AI agents. Two jobs — jump to yours:

- **Use this plugin** — you're an agent setting up persistent memory in OpenCode →
  [Set up opencode-unison](#set-up-opencode-unison)
- **Contribute to this repo** — you're changing the plugin's code →
  [Working in this repo](#working-in-this-repo)

Follows the [AGENTS.md](https://agents.md/) convention. Human contributors: see
[`CONTRIBUTING.md`](./CONTRIBUTING.md).

---

## Set up opencode-unison

You are an AI agent — Claude Code, Cursor, Codex, or any tool that can run shell
commands. **opencode-unison** gives you persistent memory across sessions, projects,
and machines. It hooks into OpenCode and connects to the **Unison brain** — a hosted
knowledge store you can read and write over a simple HTTP API.

### 1. Install

```bash
bunx opencode-unison@latest install
```

This registers the plugin in `~/.config/opencode/opencode.jsonc`:

```json
{
  "plugin": ["opencode-unison@latest"]
}
```

For headless / no-TUI environments:

```bash
bunx opencode-unison@latest install --no-tui
```

### 2. Authenticate

You need a `usk_live_...` key from the Unison brain. Three ways:

**Browser (interactive — ask the human to run this):**
```bash
bunx opencode-unison@latest login
```

**Headless (email + OTP, no browser):**
```bash
bunx opencode-unison@latest login --headless
```

**Environment variable (CI / automation):**
```bash
export UNISON_TOKEN="usk_live_..."
export UNISON_BASE_URL="https://api.unisonlabs.ai"   # optional override
```

The plugin reads the key in this priority order:
1. `UNISON_TOKEN` env var
2. `token` in `~/.config/opencode/unison.jsonc`
3. `~/.unison-opencode/credentials.json` (saved by `login`)

### 3. Verify

```bash
bunx opencode-unison@latest status
```

Should print: connected email, tenant ID, and doc counts. If not:
- Is `UNISON_TOKEN` set, or does `~/.unison-opencode/credentials.json` exist?
- Is `opencode-unison` listed in `~/.config/opencode/opencode.jsonc`?
- Check logs: `tail ~/.opencode-unison.log`

### 4. Initialize codebase memory (optional)

Run `/unison-init` inside OpenCode to have the agent explore and memorize codebase
structure, patterns, and conventions.

### How the plugin works (for agents)

The `unison` tool is available inside every OpenCode session once the plugin is loaded:

| Mode     | Args                          | What it does                         |
| -------- | ----------------------------- | ------------------------------------ |
| `add`    | `content`, `kind?`, `scope?`  | Write a memory to the brain          |
| `search` | `query`, `scope?`             | Hybrid keyword+semantic recall       |
| `list`   | `scope?`, `limit?`            | Browse recent memories               |
| `forget` | `path`                        | Delete a memory by path              |
| `status` | —                             | Brain health + doc counts            |

**Scopes:** `project` (default — this directory only) or `user` (all projects).

**Kinds:** `project-config`, `architecture`, `error-solution`, `preference`,
`learned-pattern`, `conversation`.

Memory-trigger phrases (`remember`, `save this`, `don't forget`, etc.) automatically
surface a nudge to call `unison(mode: "add", ...)`.

### Direct API access (advanced)

If you need the raw HTTP API, the brain is at `UNISON_BASE_URL` (default:
`https://api.unisonlabs.ai`). Every request needs:

```
Authorization: Bearer <usk_...>
```

Key endpoints:
- `GET /v1/brain/search?q=<query>&k=5&tag=<tag>` — hybrid search
- `PUT /v1/brain/doc` — write a document (body: `{path, bodyMd, kind, tags, visibility}`)
- `GET /v1/auth/whoami` — verify token + get tenant info

See [SPEC.md in the unison-brain repo](https://github.com/unison-labs-ai/unison-brain/blob/main/SPEC.md)
for the full API contract.

---

## Working in this repo

**opencode-unison** is a single-package TypeScript plugin for OpenCode. Source lives
in `src/`; output goes to `dist/`.

### Build, test, lint (run before every PR)

```bash
bun install
bun run build       # bundles dist/index.js, dist/cli.js, and .d.ts declarations
bun run typecheck   # tsc --noEmit (no output files)
bun lint            # biome check (if configured) or tsc --noEmit
```

CI runs `bun install && bun run build` on every PR to `main`. All checks must pass.

### Source layout

```
src/
  index.ts           # Plugin entry point (UnisonPlugin export)
  cli.ts             # opencode-unison CLI
  config.ts          # Config loading (env > config file > credentials)
  types/index.ts     # Shared types (MemoryScope, MemoryKind, etc.)
  services/
    auth.ts          # Auth flows (browser loopback + headless OTP)
    client.ts        # UnisonBrainClient — SDK wrapper
    compaction.ts    # Pre-emptive compaction hook
    context.ts       # Context injection formatting
    jsonc.ts         # JSONC comment stripping
    logger.ts        # File logger (~/.opencode-unison.log)
    openUrl.ts       # Cross-platform browser opener
    privacy.ts       # <private>...</private> tag stripping
    tags.ts          # Scope tag generation (directory + git email hash)
```

### Conventions

- TypeScript + ESM. No Biome config yet — keep existing formatting style.
- **No runtime dependencies beyond `@opencode-ai/plugin` and `@unisonlabs/sdk`.**
- Never write credentials, tokens, or keys to any file other than the credential store.
- Never log `usk_` keys — the logger masks tokens automatically.
- The plugin is a thin UX layer; the brain is the security boundary. Do not add
  client-side auth checks or path allow-lists.

### PRs

One logical change per PR. Conventional commit messages (`feat:`, `fix:`, `docs:`,
`chore:`). Never push to `main` directly — open a PR. Security issues: see
[`SECURITY.md`](./SECURITY.md).
