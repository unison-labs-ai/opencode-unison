<p align="center"><img src="https://raw.githubusercontent.com/unison-labs-ai/unison-brain/main/assets/brain.svg" width="140" /></p>

<h1 align="center">opencode-unison</h1>

<p align="center"><strong>OpenCode forgets. Unison remembers — across sessions, projects, and machines.</strong></p>

<p align="center">
  Persistent memory for <a href="https://unisonlabs.ai">OpenCode</a> — powered by the <a href="https://unisonlabs.ai">Unison brain</a>.
</p>

<p align="center">
  <a href="https://github.com/unison-labs-ai/opencode-unison/actions/workflows/ci.yml"><img src="https://github.com/unison-labs-ai/opencode-unison/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT" /></a>
  <a href="https://github.com/unison-labs-ai/opencode-unison"><img src="https://img.shields.io/github/stars/unison-labs-ai/opencode-unison?style=social" alt="Stars" /></a>
</p>

<p align="center">
  <a href="#with-unison-vs-without"><strong>Why</strong></a> •
  <a href="#installation"><strong>Install</strong></a> •
  <a href="#features"><strong>Features</strong></a> •
  <a href="#tool-usage"><strong>Tool usage</strong></a> •
  <a href="#configuration"><strong>Config</strong></a> •
  <a href="#auth"><strong>Auth</strong></a>
</p>

---

### With Unison vs. without

| Without memory | With opencode-unison |
|---|---|
| _"What build command do we use?"_ → agent guesses or asks you again | Context injected automatically at session start — agent knows instantly |
| Close the terminal, lose the thread | Memories persist across sessions, projects, and machines |
| Re-explain conventions every time you switch repos | `/unison-init` indexes the codebase once; every future session inherits it |
| Agent compacts mid-session and loses prior context | Preemptive compaction saves a brain snapshot before OpenCode summarizes |
| "Remember this" — it doesn't | Say "remember", "save this", "don't forget" — agent saves to the brain |

---

## Installation

### For Humans

```bash
bunx opencode-unison@latest install
```

Then authenticate with Unison:

```bash
bunx opencode-unison@latest login
```

Check the connection any time:

```bash
bunx opencode-unison@latest status
```

**Or let your agent do it** — paste this into OpenCode:

```
Install opencode-unison by following https://raw.githubusercontent.com/unison-labs-ai/opencode-unison/main/README.md
```

### For LLM Agents

<details>
<summary>Instructions for LLM Agents (click to expand)</summary>

If you're an LLM agent helping set up opencode-unison, follow these steps:

#### Step 1: Run the installer

```bash
bunx opencode-unison@latest install --no-tui
```

This will:

- Register the plugin in `~/.config/opencode/opencode.jsonc`
- Create the `/unison-init`, `/unison-login`, `/unison-logout`, and `/unison-status` commands

#### Step 2: Verify the config

```bash
cat ~/.config/opencode/opencode.jsonc
```

Should contain:

```json
{
  "plugin": ["opencode-unison@latest"]
}
```

#### Step 3: Authenticate

**Browser flow (interactive):**

```bash
bunx opencode-unison@latest login
```

**Headless flow (email + OTP, no browser):**

```bash
bunx opencode-unison@latest login --headless
```

This uses the Unison machine-auth API:
1. Provisions an account (or requests a key if the email already exists)
2. Prompts for the OTP sent to the email
3. Verifies and saves the `usk_live_...` key to `~/.unison-opencode/credentials.json`

You can also skip the flow entirely by setting the env var:

```bash
export UNISON_TOKEN="usk_live_..."
```

Or create `~/.config/opencode/unison.json`:

```json
{
  "token": "usk_live_..."
}
```

#### Step 4: Verify setup

```bash
bunx opencode-unison@latest status
```

If not connected, check:

1. Is `UNISON_TOKEN` set, or does `~/.unison-opencode/credentials.json` exist?
2. Is the plugin in `opencode.jsonc`?
3. Check logs: `tail ~/.opencode-unison.log`

#### Step 5: Initialize codebase memory (optional)

Run `/unison-init` to have the agent explore and memorize the codebase.

</details>

## Features

### Context Injection

On first message, the agent receives (invisible to user):

- Project memories (all project knowledge)
- Relevant user memories (semantic search, if enabled)

Example of what the agent sees:

```
[UNISON BRAIN]

Project Knowledge:
- Uses Bun, not Node.js
- Build: bun run build

Relevant Memories:
- [82%] Build fails if .env.local missing
```

The agent uses this context automatically — no manual prompting needed.

### Keyword Detection

Say "remember", "save this", "don't forget" etc. and the agent auto-saves to the brain.

```
You: "Remember that this project uses bun"
Agent: [saves to project memory via unison(mode: "add")]
```

Add custom triggers via `keywordPatterns` config.

### Codebase Indexing

Run `/unison-init` to explore and memorize your codebase structure, patterns, and conventions.

### Preemptive Compaction

When context hits 80% capacity:

1. Triggers OpenCode's summarization
2. Injects project memories into summary context
3. Saves session summary as a brain memory

This preserves conversation context across compaction events.

### Privacy

```
API key is <private>usk_live_abc123</private>
```

Content in `<private>` tags is never stored.

## Tool Usage

The `unison` tool is available to the agent:

| Mode     | Args                          | Description                          |
| -------- | ----------------------------- | ------------------------------------ |
| `add`    | `content`, `kind?`, `scope?`  | Store memory in the brain            |
| `search` | `query`, `scope?`             | Hybrid keyword+semantic recall       |
| `list`   | `scope?`, `limit?`            | Browse recent memories               |
| `forget` | `path`                        | Delete a memory by path              |
| `status` | —                             | Brain health + doc counts            |

**Scopes:** `user` (cross-project), `project` (default)

**Kinds:** `project-config`, `architecture`, `error-solution`, `preference`, `learned-pattern`, `conversation`

## Memory Scoping

| Scope   | Tag                                        | Persists     |
| ------- | ------------------------------------------ | ------------ |
| User    | `opencode_user_{sha256(git email)}`        | All projects |
| Project | `opencode_project_{sha256(directory)}`     | This project |

## Configuration

Create `~/.config/opencode/unison.jsonc`:

```jsonc
{
  // API token (can also use UNISON_TOKEN env var)
  "token": "usk_live_...",

  // Override the API base URL
  // "apiUrl": "https://brain.unisonlabs.ai",

  // Min similarity for memory retrieval (0-1)
  "similarityThreshold": 0.6,

  // Max memories injected per request
  "maxMemories": 5,

  // Max project memories listed
  "maxProjectMemories": 10,

  // Include user memories in injected context
  "injectUserMemories": true,

  // Prefix for auto-generated scope tags
  "tagPrefix": "opencode",

  // Optional: exact tag for user-scoped memories (overrides auto-generated)
  // "userScopeTag": "my-team-workspace",

  // Optional: exact tag for project-scoped memories (overrides auto-generated)
  // "projectScopeTag": "my-awesome-project",

  // Extra keyword patterns for memory detection (regex)
  "keywordPatterns": ["log\\s+this", "write\\s+down"],

  // Context usage ratio that triggers compaction (0-1)
  "compactionThreshold": 0.8,

  // Recall brain on every prompt, not just session start
  "recallEveryPrompt": false,
}
```

All fields optional. `UNISON_TOKEN` env var takes precedence over config file.

### Scope Tag Override

By default, scope tags are auto-generated using `tagPrefix` plus a hash of the directory / git email:

- User tag: `{prefix}_user_{hash(git_email)}`
- Project tag: `{prefix}_project_{hash(directory)}`

Override with explicit tags:

```jsonc
{
  "userScopeTag": "my-team-workspace",
  "projectScopeTag": "my-awesome-project"
}
```

Useful for sharing memories across team members or syncing between machines.

## Auth

`UNISON_TOKEN` is a `usk_live_...` key minted by the Unison brain API. Three ways to get one:

1. **Browser login:** `bunx opencode-unison@latest login` — opens Unison app, saves key to `~/.unison-opencode/credentials.json`
2. **Headless:** `bunx opencode-unison@latest login --headless` — provisions via email + OTP, no browser
3. **Manual:** set `UNISON_TOKEN` env var or `token` in config

Token priority: `UNISON_TOKEN` env > config file `token` > credential file.

## Development

```bash
bun install
bun run build
bun run typecheck
```

Local install:

```jsonc
{
  "plugin": ["file:///path/to/opencode-unison"]
}
```

## Logs

```bash
tail -f ~/.opencode-unison.log
```

## Star history

If this plugin saves your agent one "wait, what did we decide here?" — give it a star. ⭐

<p align="center"><a href="https://star-history.com/#unison-labs-ai/opencode-unison&Date"><img src="https://api.star-history.com/svg?repos=unison-labs-ai/opencode-unison&type=Date" width="600" /></a></p>

---

## Part of the Unison Labs constellation

**One brain, every agent.** Every repo below reads from _and writes to_ the same [Unison brain](https://unisonlabs.ai) — no per-tool memory silos.

| Repo | What it does |
|---|---|
| [unison-brain](https://github.com/unison-labs-ai/unison-brain) | CLI · SDK · MCP server — the core |
| [claude-unison](https://github.com/unison-labs-ai/claude-unison) | Memory for Claude Code |
| [cursor-unison](https://github.com/unison-labs-ai/cursor-unison) | Memory for Cursor |
| [codex-unison](https://github.com/unison-labs-ai/codex-unison) | Memory for OpenAI Codex CLI |
| **[opencode-unison](https://github.com/unison-labs-ai/opencode-unison)** | **Memory for OpenCode ← you are here** |
| [openclaw-unison](https://github.com/unison-labs-ai/openclaw-unison) | Memory for OpenClaw |
| [pipecat-unison](https://github.com/unison-labs-ai/pipecat-unison) | Memory for Pipecat voice agents |
| [python-sdk](https://github.com/unison-labs-ai/python-sdk) | Python SDK for the brain |
| [install-mcp](https://github.com/unison-labs-ai/install-mcp) | One-command MCP installer |
| [code-chunk](https://github.com/unison-labs-ai/code-chunk) | AST-aware code chunking |
| [unison-fs](https://github.com/unison-labs-ai/unison-fs) | Mount the brain as a filesystem |
| [backchannel](https://github.com/unison-labs-ai/backchannel) | Async messaging between agents |
| [Unison-evals](https://github.com/unison-labs-ai/Unison-evals) | Open memory benchmark suite |

## License

MIT © Unison Labs
