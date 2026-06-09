import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { stripJsoncComments } from "./services/jsonc.js";
import { loadCredentials } from "./services/auth.js";

const CONFIG_DIR = join(homedir(), ".config", "opencode");
const CONFIG_FILES = [
  join(CONFIG_DIR, "unison.jsonc"),
  join(CONFIG_DIR, "unison.json"),
];

export interface UnisonConfig {
  /** Unison API token (usk_...). Can also be set via UNISON_TOKEN env var. */
  token?: string;
  /** Override the API base URL. Defaults to https://api.unisonlabs.ai */
  apiUrl?: string;
  /** Minimum similarity score for search recall (0–1). Default 0.6 */
  similarityThreshold?: number;
  /** Max brain search results injected per request. Default 5 */
  maxMemories?: number;
  /** Max project memories listed on init. Default 10 */
  maxProjectMemories?: number;
  /** Max profile facts injected on session start. Default 5 */
  maxProfileItems?: number;
  /** Inject compiled profile facts from the brain at session start. Default true */
  injectProfile?: boolean;
  /** Include user-scoped memories in context. Default true */
  injectUserMemories?: boolean;
  /** Tag prefix for auto-generated scope tags. Default "opencode" */
  tagPrefix?: string;
  /** Exact tag to use for user-scoped memories (overrides auto-generated tag). */
  userScopeTag?: string;
  /** Exact tag to use for project-scoped memories (overrides auto-generated tag). */
  projectScopeTag?: string;
  /**
   * System prompt fragment passed to the brain when LLM-filtering is enabled.
   * Describes what kind of memories to retain vs. discard.
   */
  filterPrompt?: string;
  /**
   * When true, the plugin signals the brain to run LLM-based deduplication/
   * filtering on new memories before storing them. Default true.
   */
  shouldLLMFilter?: boolean;
  /** Extra keyword patterns (regex) that trigger memory save nudge. */
  keywordPatterns?: string[];
  /** Context usage ratio that triggers preemptive compaction (0–1). Default 0.8 */
  compactionThreshold?: number;
  /**
   * Recall brain on every prompt, not just session start. Default false unless
   * a config file exists (in which case defaults to true).
   */
  recallEveryPrompt?: boolean;
  /**
   * Automatically save a conversation summary to the brain every N assistant turns.
   * 0 = disabled (default). E.g. 3 = save after every 3rd turn.
   */
  captureEveryNTurns?: number;
}

const DEFAULT_KEYWORD_PATTERNS = [
  "remember",
  "memorize",
  "save\\s+this",
  "note\\s+this",
  "keep\\s+in\\s+mind",
  "don'?t\\s+forget",
  "learn\\s+this",
  "store\\s+this",
  "record\\s+this",
  "make\\s+a\\s+note",
  "take\\s+note",
  "jot\\s+down",
  "commit\\s+to\\s+memory",
  "remember\\s+that",
  "never\\s+forget",
  "always\\s+remember",
];

function isValidRegex(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

function loadRawConfig(): { config: UnisonConfig; existed: boolean } {
  for (const path of CONFIG_FILES) {
    if (existsSync(path)) {
      try {
        const content = readFileSync(path, "utf-8");
        const json = stripJsoncComments(content);
        return { config: JSON.parse(json) as UnisonConfig, existed: true };
      } catch {
        return { config: {}, existed: true };
      }
    }
  }
  return { config: {}, existed: false };
}

const { config: fileConfig, existed: configExisted } = loadRawConfig();

function getToken(): string | undefined {
  if (process.env.UNISON_TOKEN) return process.env.UNISON_TOKEN;
  if (fileConfig.token) return fileConfig.token;
  return loadCredentials()?.token;
}

export const UNISON_TOKEN = getToken();

export function getApiBaseUrl(): string {
  return (
    process.env.UNISON_API_URL ??
    fileConfig.apiUrl ??
    "https://api.unisonlabs.ai"
  );
}

export const CONFIG_FILE = CONFIG_FILES[1]!;

const DEFAULT_FILTER_PROMPT =
  "You are a stateful coding agent. Remember all the information, including but not limited to the user's coding preferences, tech stack, behaviours, workflows, and any other relevant details.";

export const CONFIG = {
  similarityThreshold: fileConfig.similarityThreshold ?? 0.6,
  maxMemories: fileConfig.maxMemories ?? 5,
  maxProjectMemories: fileConfig.maxProjectMemories ?? 10,
  maxProfileItems: fileConfig.maxProfileItems ?? 5,
  injectProfile: fileConfig.injectProfile ?? true,
  injectUserMemories: fileConfig.injectUserMemories ?? true,
  filterPrompt: fileConfig.filterPrompt ?? DEFAULT_FILTER_PROMPT,
  shouldLLMFilter: fileConfig.shouldLLMFilter ?? true,
  tagPrefix: fileConfig.tagPrefix ?? "opencode",
  userScopeTag: fileConfig.userScopeTag,
  projectScopeTag: fileConfig.projectScopeTag,
  keywordPatterns: [
    ...DEFAULT_KEYWORD_PATTERNS,
    ...(fileConfig.keywordPatterns ?? []).filter(isValidRegex),
  ],
  compactionThreshold: (() => {
    const v = fileConfig.compactionThreshold;
    if (v == null || typeof v !== "number" || isNaN(v) || v <= 0 || v > 1) return 0.8;
    return v;
  })(),
  recallEveryPrompt:
    fileConfig.recallEveryPrompt ??
    (configExisted ? true : false),
  captureEveryNTurns:
    fileConfig.captureEveryNTurns ??
    (configExisted ? 3 : 0),
};

export function isConfigured(): boolean {
  return !!UNISON_TOKEN;
}

/**
 * Write sensible install defaults to the config file.
 * Called on `install` so first-time users get the recommended settings.
 * isExistingInstall = true means a config file already existed before install.
 */
export function writeInstallDefaults(isExistingInstall: boolean): void {
  const current = loadRawConfig().config;
  const next: UnisonConfig = { ...current };
  if (isExistingInstall) {
    if (next.recallEveryPrompt === undefined) next.recallEveryPrompt = true;
    if (next.captureEveryNTurns === undefined) next.captureEveryNTurns = 3;
  } else {
    next.recallEveryPrompt = false;
    next.captureEveryNTurns = 0;
  }
  const configPath = CONFIG_FILES[1]!;
  writeFileSync(configPath, JSON.stringify(next, null, 2));
}
