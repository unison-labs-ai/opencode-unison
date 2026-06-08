import { BrainClient } from "@unisonlabs/sdk";
import type { SearchResult, BrainDocument } from "@unisonlabs/sdk";
import { CONFIG, UNISON_TOKEN, getApiBaseUrl, isConfigured } from "../config.js";
import { log } from "./logger.js";

const TIMEOUT_MS = 30_000;
const MAX_CONTENT_CHARS = 200_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    ),
  ]);
}

/**
 * Thin wrapper around BrainClient that:
 *  - handles search, write, delete, and list via the official SDK
 *  - maps Unison brain doc paths under writable roots (/private/ or /tenant/)
 *  - exposes a memory-shaped API so the plugin layer stays clean
 */
export class UnisonBrainClient {
  private client: BrainClient | null = null;

  private getClient(): BrainClient {
    if (!this.client) {
      if (!isConfigured()) throw new Error("UNISON_TOKEN is not set");
      this.client = new BrainClient({
        baseUrl: getApiBaseUrl(),
        token: UNISON_TOKEN,
      });
    }
    return this.client;
  }

  /**
   * Search the brain using hybrid keyword+semantic search.
   * Scoped by tag so user memories and project memories stay separate.
   */
  async searchMemories(
    query: string,
    tag: string
  ): Promise<{ success: true; results: SearchResult[] } | { success: false; error: string }> {
    log("searchMemories: start", { tag, query: query.slice(0, 80) });
    try {
      const results = await withTimeout(
        this.getClient().search(query, {
          limit: CONFIG.maxMemories,
          tags: [tag],
        }),
        TIMEOUT_MS
      );
      log("searchMemories: ok", { count: results.length });
      return { success: true, results };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log("searchMemories: error", { error: msg });
      return { success: false, error: msg };
    }
  }

  /**
   * Write a memory document to the brain.
   * The path is always under /private/opencode-memories/ keyed by a slug
   * derived from the tag and a timestamp so writes never collide.
   */
  async addMemory(
    content: string,
    tag: string,
    meta?: { kind?: string }
  ): Promise<{ success: true; path: string } | { success: false; error: string }> {
    const slug = `${tag}-${Date.now()}`;
    const path = `/private/opencode-memories/${slug}.md`;
    const truncated =
      content.length > MAX_CONTENT_CHARS
        ? content.slice(0, MAX_CONTENT_CHARS) + "\n...[truncated]"
        : content;

    log("addMemory: start", { path, tag });
    try {
      const doc = await withTimeout(
        this.getClient().write({
          path,
          bodyMd: truncated,
          kind: meta?.kind === "conversation" ? "log" : "note",
          tags: [tag, "opencode-memory"],
          visibility: "private",
        }),
        TIMEOUT_MS
      );
      log("addMemory: ok", { path: doc.path });
      return { success: true, path: doc.path };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log("addMemory: error", { error: msg });
      return { success: false, error: msg };
    }
  }

  /**
   * Delete a brain document by path.
   */
  async deleteMemory(
    path: string
  ): Promise<{ success: true } | { success: false; error: string }> {
    log("deleteMemory: start", { path });
    try {
      await withTimeout(this.getClient().delete(path), TIMEOUT_MS);
      log("deleteMemory: ok", { path });
      return { success: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log("deleteMemory: error", { error: msg });
      return { success: false, error: msg };
    }
  }

  /**
   * List memories scoped to a tag.
   */
  async listMemories(
    tag: string,
    limit = 20
  ): Promise<
    { success: true; memories: BrainDocument[] } | { success: false; error: string }
  > {
    log("listMemories: start", { tag, limit });
    try {
      const docs = await withTimeout(
        this.getClient().list({
          prefix: "/private/opencode-memories/",
          tags: [tag],
          limit,
        }),
        TIMEOUT_MS
      );
      log("listMemories: ok", { count: docs.length });
      return { success: true, memories: docs };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log("listMemories: error", { error: msg });
      return { success: false, error: msg };
    }
  }

  /**
   * Verify the token works and return account info.
   */
  async whoami(): Promise<
    | { success: true; email: string | null; tenantId: string; scopes: string[] }
    | { success: false; error: string }
  > {
    try {
      const info = await withTimeout(this.getClient().whoami(), TIMEOUT_MS);
      return {
        success: true,
        email: info.user.email,
        tenantId: info.tenant.id,
        scopes: info.scopes,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg };
    }
  }

  /**
   * Brain status (doc counts, job queue, etc.)
   */
  async brainStatus() {
    return withTimeout(this.getClient().status(), TIMEOUT_MS);
  }
}

export const brainClient = new UnisonBrainClient();
