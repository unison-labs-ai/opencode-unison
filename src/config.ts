import { existsSync, readFileSync } from "node:fs";
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
  /** Include user-scoped memories in context. Default true */
  injectUserMemories?: boolean;
  /** Tag prefix for auto-generated scope tags. Default "opencode" */
  tagPrefix?: string;
  /** Exact tag to use for user-scoped memories (overrides auto-generated tag). */
  userScopeTag?: string;
  /** Exact tag to use for project-scoped memories (overrides auto-generated tag). */
  projectScopeTag?: string;
  /** Extra keyword patterns (regex) that trigger memory save nudge. */
  keywordPatterns?: string[];
  /** Context usage ratio that triggers preemptive compaction (0–1). Default 0.8 */
  compactionThreshold?: number;
  /** Recall brain on every prompt, not just session start. Default false */
  recallEveryPrompt?: boolean;
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

function loadRawConfig(): UnisonConfig {
  for (const path of CONFIG_FILES) {
    if (existsSync(path)) {
      try {
        const content = readFileSync(path, "utf-8");
        const json = stripJsoncComments(content);
        return JSON.parse(json) as UnisonConfig;
      } catch {
        return {};
      }
    }
  }
  return {};
}

const fileConfig = loadRawConfig();

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

export const CONFIG = {
  similarityThreshold: fileConfig.similarityThreshold ?? 0.6,
  maxMemories: fileConfig.maxMemories ?? 5,
  maxProjectMemories: fileConfig.maxProjectMemories ?? 10,
  injectUserMemories: fileConfig.injectUserMemories ?? true,
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
  recallEveryPrompt: fileConfig.recallEveryPrompt ?? false,
};

export function isConfigured(): boolean {
  return !!UNISON_TOKEN;
}
