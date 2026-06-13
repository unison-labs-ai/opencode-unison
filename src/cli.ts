#!/usr/bin/env node
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import * as readline from "node:readline";
import { stripJsoncComments } from "./services/jsonc.js";
import {
  startAuthFlow,
  clearCredentials,
  loadCredentials,
  CREDENTIALS_FILE,
  provisionAndVerify,
} from "./services/auth.js";
import { CONFIG, CONFIG_FILE, UNISON_TOKEN, getApiBaseUrl, isConfigured, writeInstallDefaults } from "./config.js";
import { UnisonBrainClient } from "./services/client.js";
import { getTags } from "./services/tags.js";

const OPENCODE_CONFIG_DIR = join(homedir(), ".config", "opencode");
const OPENCODE_COMMAND_DIR = join(OPENCODE_CONFIG_DIR, "command");
const OH_MY_OPENCODE_CONFIG = join(OPENCODE_CONFIG_DIR, "oh-my-opencode.json");
const PLUGIN_NAME = "opencode-unison@latest";
const DEFAULT_CONFIG_FILE = CONFIG_FILE ?? join(OPENCODE_CONFIG_DIR, "unison.json");

const UNISON_INIT_COMMAND = `---
description: Initialize Unison brain with comprehensive codebase knowledge
---

# Initializing Unison Brain Memory

You are initializing persistent memory for this codebase. This is not just data collection — you're building context that will make you significantly more effective across all future sessions.

## Understanding Context

You are a **stateful** coding agent. Users expect you to work with them over extended periods — potentially the entire lifecycle of a project. Your memory is how you get better over time and maintain continuity.

## What to Remember

### 1. Procedures (Rules & Workflows)
Explicit rules that should always be followed:
- "Never commit directly to main — always use feature branches"
- "Always run lint before tests"
- "Use conventional commits format"

### 2. Preferences (Style & Conventions)
Project and user coding style:
- "Prefer functional components over class components"
- "Use early returns instead of nested conditionals"
- "Always add JSDoc to exported functions"

### 3. Architecture & Context
How the codebase works and why:
- "Auth system was refactored in v2.0 — old patterns deprecated"
- "The monorepo used to have 3 modules before consolidation"
- "This pagination bug was fixed before — similar to PR #234"

## Memory Scopes

**Project-scoped** (\`scope: "project"\`):
- Build/test/lint commands
- Architecture and key directories
- Team conventions specific to this codebase
- Technology stack and framework choices
- Known issues and their solutions

**User-scoped** (\`scope: "user"\`):
- Personal coding preferences across all projects
- Communication style preferences
- General workflow habits

## Research Approach

This is a **deep research** initialization. Take your time and be thorough (~50+ tool calls). The goal is to genuinely understand the project, not just collect surface-level facts.

**What to uncover:**
- Tech stack and dependencies (explicit and implicit)
- Project structure and architecture
- Build/test/deploy commands and workflows
- Contributors & team dynamics (who works on what?)
- Commit conventions and branching strategy
- Code evolution (major refactors, architecture changes)
- Pain points (areas with lots of bug fixes)
- Implicit conventions not documented anywhere

## Research Techniques

### File-based
- README.md, CONTRIBUTING.md, AGENTS.md, CLAUDE.md
- Package manifests (package.json, Cargo.toml, pyproject.toml, go.mod)
- Config files (.eslintrc, tsconfig.json, .prettierrc)
- CI/CD configs (.github/workflows/)

### Git-based
- \`git log --oneline -20\` — Recent history
- \`git branch -a\` — Branching strategy
- \`git log --format="%s" -50\` — Commit conventions
- \`git shortlog -sn --all | head -10\` — Main contributors

### Explore Agent
Fire parallel explore queries for broad understanding:
\`\`\`
Task(explore, "What is the tech stack and key dependencies?")
Task(explore, "What is the project structure? Key directories?")
Task(explore, "How do you build, test, and run this project?")
Task(explore, "What are the main architectural patterns?")
Task(explore, "What conventions or patterns are used?")
\`\`\`

## How to Do Thorough Research

**Don't just collect data — analyze and cross-reference.**

Bad (shallow):
- Run commands, copy output
- List facts without understanding

Good (thorough):
- Cross-reference findings (if inconsistent, dig deeper)
- Resolve ambiguities (don't leave questions unanswered)
- Read actual file content, not just names
- Look for patterns (what do commits tell you about workflow?)
- Think like a new team member — what would you want to know?

## Saving Memories

Use the \`unison\` tool for each distinct insight:

\`\`\`
unison(mode: "add", content: "...", kind: "...", scope: "project")
\`\`\`

**Kinds:**
- \`project-config\` — tech stack, commands, tooling
- \`architecture\` — codebase structure, key components, data flow
- \`learned-pattern\` — conventions specific to this codebase
- \`error-solution\` — known issues and their fixes
- \`preference\` — coding style preferences (use with user scope)

**Guidelines:**
- Save each distinct insight as a separate memory
- Be concise but include enough context to be useful
- Include the "why" not just the "what" when relevant
- Update memories incrementally as you research (don't wait until the end)

**Good memories:**
- "Uses Bun runtime and package manager. Commands: bun install, bun run dev, bun test"
- "API routes in src/routes/, handlers in src/handlers/. Hono framework."
- "Auth uses Redis sessions, not JWT. Implementation in src/lib/auth.ts"
- "Never use \`any\` type — strict TypeScript. Use \`unknown\` and narrow."
- "Database migrations must be backward compatible — we do rolling deploys"

## Upfront Questions

Before diving in, ask:
1. "Any specific rules I should always follow?"
2. "Preferences for how I communicate? (terse/detailed)"

## Reflection Phase

Before finishing, reflect:
1. **Completeness**: Did you cover commands, architecture, conventions, gotchas?
2. **Quality**: Are memories concise and searchable?
3. **Scope**: Did you correctly separate project vs user knowledge?

Then ask: "I've initialized memory with X insights. Want me to continue refining, or is this good?"

## Your Task

1. Ask upfront questions (research depth, rules, preferences)
2. Check existing memories: \`unison(mode: "list", scope: "project")\`
3. Research based on chosen depth
4. Save memories incrementally as you discover insights
5. Reflect and verify completeness
6. Summarize what was learned and ask if user wants refinement
`;

const UNISON_LOGIN_COMMAND = `---
description: Authenticate with Unison via browser
---

# Unison Brain Login

Run this command to authenticate the user with the Unison brain:

\`\`\`bash
bunx opencode-unison@latest login
\`\`\`

This will:
1. Start a local server on a random port
2. Open the browser to the Unison authentication page
3. After the user logs in, save credentials to ~/.unison-opencode/credentials.json

Wait for the command to complete, then inform the user whether authentication succeeded or failed.

If the user wants to log out instead, tell them to use the /unison-logout command.
`;

const UNISON_LOGOUT_COMMAND = `---
description: Log out from Unison brain and clear credentials
---

# Unison Brain Logout

Run this command to log out and clear Unison credentials:

\`\`\`bash
bunx opencode-unison@latest logout
\`\`\`

This will remove the saved credentials from ~/.unison-opencode/credentials.json.

Inform the user whether logout succeeded and that they'll need to run /unison-login to re-authenticate.
`;

const UNISON_STATUS_COMMAND = `---
description: Show Unison brain connection status
---

# Unison Brain Status

Run this command to check whether OpenCode is connected to the Unison brain:

\`\`\`bash
bunx opencode-unison@latest status
\`\`\`

Report the connection status, credential source, API URL, and brain health if available.

Never print the full API token.
`;

function createReadline(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

async function confirm(rl: readline.Interface, question: string): Promise<boolean> {
  return new Promise((resolve) => {
    rl.question(`${question} (y/n) `, (answer) => {
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

function findOpencodeConfig(): string | null {
  const candidates = [
    join(OPENCODE_CONFIG_DIR, "opencode.jsonc"),
    join(OPENCODE_CONFIG_DIR, "opencode.json"),
  ];

  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return null;
}

function addPluginToConfig(configPath: string): boolean {
  try {
    const content = readFileSync(configPath, "utf-8");

    if (content.includes("opencode-unison")) {
      console.log("Plugin already registered in config");
      return true;
    }

    const jsonContent = stripJsoncComments(content);
    let config: Record<string, unknown>;

    try {
      config = JSON.parse(jsonContent);
    } catch {
      console.error("Failed to parse config file");
      return false;
    }

    const plugins = (config.plugin as string[]) || [];
    plugins.push(PLUGIN_NAME);
    config.plugin = plugins;

    if (configPath.endsWith(".jsonc")) {
      if (content.includes('"plugin"')) {
        const newContent = content.replace(
          /("plugin"\s*:\s*\[)([^\]]*?)(\])/,
          (_match, start, middle, end) => {
            const trimmed = middle.trim();
            if (trimmed === "") {
              return `${start}\n    "${PLUGIN_NAME}"\n  ${end}`;
            }
            return `${start}${middle.trimEnd()},\n    "${PLUGIN_NAME}"\n  ${end}`;
          }
        );
        writeFileSync(configPath, newContent);
      } else {
        const newContent = content.replace(
          /^(\s*\{)/,
          `$1\n  "plugin": ["${PLUGIN_NAME}"],`
        );
        writeFileSync(configPath, newContent);
      }
    } else {
      writeFileSync(configPath, JSON.stringify(config, null, 2));
    }

    console.log(`Added plugin to ${configPath}`);
    return true;
  } catch (err) {
    console.error("Failed to update config:", err);
    return false;
  }
}

function createNewConfig(): boolean {
  const configPath = join(OPENCODE_CONFIG_DIR, "opencode.jsonc");
  mkdirSync(OPENCODE_CONFIG_DIR, { recursive: true });

  const config = `{
  "plugin": ["${PLUGIN_NAME}"]
}
`;

  writeFileSync(configPath, config);
  console.log(`Created ${configPath}`);
  return true;
}

function createCommands(): boolean {
  mkdirSync(OPENCODE_COMMAND_DIR, { recursive: true });

  writeFileSync(join(OPENCODE_COMMAND_DIR, "unison-init.md"), UNISON_INIT_COMMAND);
  console.log("Created /unison-init command");

  writeFileSync(join(OPENCODE_COMMAND_DIR, "unison-login.md"), UNISON_LOGIN_COMMAND);
  console.log("Created /unison-login command");

  writeFileSync(join(OPENCODE_COMMAND_DIR, "unison-logout.md"), UNISON_LOGOUT_COMMAND);
  console.log("Created /unison-logout command");

  writeFileSync(join(OPENCODE_COMMAND_DIR, "unison-status.md"), UNISON_STATUS_COMMAND);
  console.log("Created /unison-status command");

  return true;
}

function isOhMyOpencodeInstalled(): boolean {
  const configPath = findOpencodeConfig();
  if (!configPath) return false;

  try {
    const content = readFileSync(configPath, "utf-8");
    return content.includes("oh-my-opencode");
  } catch {
    return false;
  }
}

function isAutoCompactAlreadyDisabled(): boolean {
  if (!existsSync(OH_MY_OPENCODE_CONFIG)) return false;

  try {
    const content = readFileSync(OH_MY_OPENCODE_CONFIG, "utf-8");
    const config = JSON.parse(content) as { disabled_hooks?: string[] };
    return config.disabled_hooks?.includes("anthropic-context-window-limit-recovery") ?? false;
  } catch {
    return false;
  }
}

function disableAutoCompactHook(): boolean {
  try {
    let config: Record<string, unknown> = {};

    if (existsSync(OH_MY_OPENCODE_CONFIG)) {
      const content = readFileSync(OH_MY_OPENCODE_CONFIG, "utf-8");
      config = JSON.parse(content) as Record<string, unknown>;
    }

    const disabledHooks = (config.disabled_hooks as string[]) || [];
    if (!disabledHooks.includes("anthropic-context-window-limit-recovery")) {
      disabledHooks.push("anthropic-context-window-limit-recovery");
    }
    config.disabled_hooks = disabledHooks;

    writeFileSync(OH_MY_OPENCODE_CONFIG, JSON.stringify(config, null, 2));
    console.log("Disabled anthropic-context-window-limit-recovery hook in oh-my-opencode.json");
    return true;
  } catch (err) {
    console.error("Failed to update oh-my-opencode.json:", err);
    return false;
  }
}

interface InstallOptions {
  tui: boolean;
  disableAutoCompact: boolean;
}

async function install(options: InstallOptions): Promise<number> {
  console.log("\nopencode-unison installer\n");

  writeInstallDefaults(existsSync(DEFAULT_CONFIG_FILE));

  const rl = options.tui ? createReadline() : null;

  console.log("Step 1: Register plugin in OpenCode config");
  const configPath = findOpencodeConfig();

  if (configPath) {
    if (options.tui) {
      const shouldModify = await confirm(rl!, `Add plugin to ${configPath}?`);
      if (shouldModify) addPluginToConfig(configPath);
      else console.log("Skipped.");
    } else {
      addPluginToConfig(configPath);
    }
  } else {
    if (options.tui) {
      const shouldCreate = await confirm(rl!, "No OpenCode config found. Create one?");
      if (shouldCreate) createNewConfig();
      else console.log("Skipped.");
    } else {
      createNewConfig();
    }
  }

  console.log("\nStep 2: Create /unison-init, /unison-login, /unison-logout, /unison-status commands");
  if (options.tui) {
    const shouldCreate = await confirm(rl!, "Add unison commands?");
    if (shouldCreate) createCommands();
    else console.log("Skipped.");
  } else {
    createCommands();
  }

  // Step 3: Configure Oh My OpenCode (if installed)
  if (isOhMyOpencodeInstalled()) {
    console.log("\nStep 3: Configure Oh My OpenCode");
    console.log("Detected Oh My OpenCode plugin.");
    console.log("Unison handles context compaction, so the built-in context-window-limit-recovery hook should be disabled.");

    if (isAutoCompactAlreadyDisabled()) {
      console.log("anthropic-context-window-limit-recovery hook already disabled");
    } else {
      if (options.tui) {
        const shouldDisable = await confirm(
          rl!,
          "Disable anthropic-context-window-limit-recovery hook to let Unison handle context?"
        );
        if (!shouldDisable) {
          console.log("Skipped.");
        } else {
          disableAutoCompactHook();
        }
      } else if (options.disableAutoCompact) {
        disableAutoCompactHook();
      } else {
        console.log("Skipped. Use --disable-context-recovery to disable the hook in non-interactive mode.");
      }
    }
  }

  if (rl) rl.close();

  console.log("\n" + "─".repeat(50));
  console.log("\nFinal step: Authenticate with Unison\n");

  if (options.tui) {
    return login();
  }

  console.log("Run this command to authenticate:");
  console.log("  bunx opencode-unison@latest login");
  console.log("\nOr set your token manually:");
  console.log('  export UNISON_TOKEN="usk_live_..."');
  console.log("\n" + "─".repeat(50));
  console.log("\nSetup complete! Restart OpenCode to activate.\n");
  return 0;
}

async function login(): Promise<number> {
  const existing = loadCredentials();
  if (existing) {
    console.log("Already authenticated. Use 'logout' first to re-authenticate.");
    return 0;
  }

  const result = await startAuthFlow();

  if (result.success) {
    console.log("\nSuccessfully authenticated with Unison!");
    console.log("Restart OpenCode to activate.\n");
    return 0;
  } else {
    console.error(`\nAuthentication failed: ${result.error}`);
    return 1;
  }
}

async function headlessProvision(): Promise<number> {
  const rl = createReadline();

  const email = await new Promise<string>((resolve) => {
    rl.question("Email: ", resolve);
  });

  const apiUrl = getApiBaseUrl();
  console.log(`Provisioning account for ${email} at ${apiUrl}...`);

  // Trigger provision/request-key
  try {
    const provRes = await fetch(`${apiUrl}/v1/auth/provision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    if (!provRes.ok) {
      const body = (await provRes.json().catch(() => ({}))) as {
        error?: { code?: string; message?: string };
      };
      if (body?.error?.code === "email_registered") {
        console.log("Account exists — sending recovery OTP...");
        await fetch(`${apiUrl}/v1/auth/request-key`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
      } else {
        console.error(`Provision error: ${body?.error?.message ?? provRes.status}`);
        rl.close();
        return 1;
      }
    } else {
      console.log("Check your email for a verification code.");
    }
  } catch (err) {
    console.error(`Network error: ${err}`);
    rl.close();
    return 1;
  }

  const otp = await new Promise<string>((resolve) => {
    rl.question("Enter verification code from email: ", resolve);
  });
  rl.close();

  const result = await provisionAndVerify(email, otp.trim(), apiUrl);

  if (result.success) {
    console.log("\nSuccessfully authenticated with Unison!");
    console.log("Restart OpenCode to activate.\n");
    return 0;
  } else {
    console.error(`\nAuthentication failed: ${result.error}`);
    return 1;
  }
}

function maskToken(token: string | undefined): string {
  if (!token) return "not set";
  if (token.length <= 12) return `${token.slice(0, 4)}...`;
  return `${token.slice(0, 8)}...${token.slice(-4)}`;
}

function getKeySource(): string {
  if (process.env.UNISON_TOKEN) return "UNISON_TOKEN env var";
  if (existsSync(CONFIG_FILE)) return CONFIG_FILE;
  if (loadCredentials()) return CREDENTIALS_FILE;
  return "not configured";
}

async function status(): Promise<number> {
  const apiUrl = getApiBaseUrl();
  const tags = getTags(process.cwd());
  const lines: string[] = [];

  lines.push("opencode-unison status");
  lines.push("");
  lines.push(`Connected: ${isConfigured() ? "checking..." : "no"}`);
  lines.push(`Token: ${maskToken(UNISON_TOKEN)} (${getKeySource()})`);
  lines.push(`API URL: ${apiUrl}`);
  lines.push(`Recall mode: ${CONFIG.recallEveryPrompt ? "recall on every prompt" : "session start only"}`);
  lines.push(`Capture cadence: ${CONFIG.captureEveryNTurns > 0 ? `every ${CONFIG.captureEveryNTurns} turn${CONFIG.captureEveryNTurns === 1 ? "" : "s"} + session end` : "session end only"}`);
  lines.push(`Project tag: ${tags.project}`);
  lines.push(`User tag: ${tags.user}`);

  if (!isConfigured()) {
    lines.push("");
    lines.push("Run /unison-login to connect, or set UNISON_TOKEN.");
    console.log(lines.join("\n"));
    return 0;
  }

  const client = new UnisonBrainClient();
  const [whoamiResult, statusResult] = await Promise.allSettled([
    client.whoami(),
    client.brainStatus(),
  ]);

  const whoami =
    whoamiResult.status === "fulfilled" && whoamiResult.value.success
      ? whoamiResult.value
      : null;

  lines[2] = whoami ? "Connected: yes" : "Connected: no";

  if (whoami) {
    lines.push("");
    lines.push("Account:");
    lines.push(`  Email: ${whoami.email ?? "(unavailable)"}`);
    lines.push(`  Workspace: ${whoami.workspaceId}`);
    lines.push(`  Scopes: ${whoami.scopes.join(", ")}`);
  } else {
    const err =
      whoamiResult.status === "fulfilled" && !whoamiResult.value.success
        ? whoamiResult.value.error
        : "request failed";
    lines.push("");
    lines.push(`Connection check failed: ${err}`);
  }

  if (statusResult.status === "fulfilled") {
    const s = statusResult.value;
    lines.push("");
    lines.push("Brain stats:");
    lines.push(`  Docs: ${s.docCount} (${s.docWithEmbedding} with embeddings)`);
    lines.push(`  Entities: ${s.entityCount}`);
    lines.push(`  Facts: ${s.factCount}`);
    lines.push(`  Pending jobs: ${s.pendingJobs}`);
  }

  console.log(lines.join("\n"));
  return 0;
}

function logout(): number {
  if (clearCredentials()) {
    console.log("Logged out. Credentials cleared.");
    if (process.env.UNISON_TOKEN) {
      console.log(
        "UNISON_TOKEN is still set in this shell, so the brain may remain active until you unset it or restart OpenCode."
      );
    }
    return 0;
  } else {
    console.log("No credentials found.");
    if (process.env.UNISON_TOKEN) {
      console.log("UNISON_TOKEN is still set in this shell.");
    }
    return 0;
  }
}

function printHelp(): void {
  console.log(`
opencode-unison — Persistent brain memory for OpenCode agents

Commands:
  install       Install and configure the plugin
    --no-tui                     Non-interactive mode (for LLM agents)
    --disable-context-recovery   Disable Oh My OpenCode's context hook
  login         Authenticate via browser (opens browser)
  login --headless  Authenticate via email + OTP (no browser needed)
  logout        Clear stored credentials
  status        Show brain connection status

Examples:
  bunx opencode-unison@latest install
  bunx opencode-unison@latest login
  bunx opencode-unison@latest login --headless
  bunx opencode-unison@latest logout
  bunx opencode-unison@latest status

Environment variables:
  UNISON_TOKEN     usk_live_... key (takes precedence over config file)
  UNISON_API_URL   Override API base URL (default: https://brain.unisonlabs.ai)
  UNISON_APP_URL   Override app URL for browser login (default: https://app.unisonlabs.ai)
`);
}

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === "help" || args[0] === "--help" || args[0] === "-h") {
  printHelp();
  process.exit(0);
}

if (args[0] === "install") {
  const noTui = args.includes("--no-tui");
  const disableAutoCompact = args.includes("--disable-context-recovery");
  install({ tui: !noTui, disableAutoCompact }).then((code) => process.exit(code));
} else if (args[0] === "setup") {
  console.log("Note: 'setup' is deprecated. Use 'install' instead.\n");
  const noTui = args.includes("--no-tui");
  const disableAutoCompact = args.includes("--disable-context-recovery");
  install({ tui: !noTui, disableAutoCompact }).then((code) => process.exit(code));
} else if (args[0] === "login") {
  if (args.includes("--headless")) {
    headlessProvision().then((code) => process.exit(code));
  } else {
    login().then((code) => process.exit(code));
  }
} else if (args[0] === "logout") {
  process.exit(logout());
} else if (args[0] === "status") {
  status().then((code) => process.exit(code));
} else {
  console.error(`Unknown command: ${args[0]}`);
  printHelp();
  process.exit(1);
}
