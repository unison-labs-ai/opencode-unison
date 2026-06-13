import type { Plugin, PluginInput } from "@opencode-ai/plugin";
import type { Part } from "@opencode-ai/sdk";
import { tool } from "@opencode-ai/plugin";

import { brainClient } from "./services/client.js";
import { formatContextForPrompt } from "./services/context.js";
import { getTags } from "./services/tags.js";
import { stripPrivateContent, isFullyPrivate } from "./services/privacy.js";
import { createCompactionHook, type CompactionContext } from "./services/compaction.js";

import { isConfigured, CONFIG } from "./config.js";
import { log } from "./services/logger.js";
import type { MemoryScope, MemoryKind } from "./types/index.js";

const CODE_BLOCK_PATTERN = /```[\s\S]*?```/g;
const INLINE_CODE_PATTERN = /`[^`]+`/g;

const MEMORY_KEYWORD_PATTERN = new RegExp(
  `\\b(${CONFIG.keywordPatterns.join("|")})\\b`,
  "i"
);

const MEMORY_NUDGE_MESSAGE = `[BRAIN TRIGGER DETECTED]
The user wants you to remember something. You MUST use the \`unison\` tool with \`mode: "add"\` to save this information to the Unison brain.

Extract the key information the user wants remembered and save it as a concise, searchable memory.
- Use \`scope: "project"\` for project-specific knowledge (e.g., "run lint before tests")
- Use \`scope: "user"\` for cross-project preferences (e.g., "prefers concise responses")
- Choose an appropriate \`kind\`: "preference", "project-config", "learned-pattern", etc.

DO NOT skip this step. The user explicitly asked you to remember.`;

function removeCodeBlocks(text: string): string {
  return text.replace(CODE_BLOCK_PATTERN, "").replace(INLINE_CODE_PATTERN, "");
}

function detectMemoryKeyword(text: string): boolean {
  const textWithoutCode = removeCodeBlocks(text);
  return MEMORY_KEYWORD_PATTERN.test(textWithoutCode);
}

export const UnisonPlugin: Plugin = async (ctx: PluginInput) => {
  const { directory } = ctx;
  const tags = getTags(directory);
  const injectedSessions = new Set<string>();
  log("Plugin init", { directory, tags, configured: isConfigured() });

  if (!isConfigured()) {
    log("Plugin disabled — UNISON_TOKEN not set");
  }

  // Pre-fetch model limits for compaction threshold calculations
  const modelLimits = new Map<string, number>();

  (async () => {
    try {
      const response = await ctx.client.provider.list();
      if (response.data?.all) {
        for (const provider of response.data.all) {
          if (provider.models) {
            for (const [modelId, model] of Object.entries(provider.models)) {
              if (model.limit?.context) {
                modelLimits.set(`${provider.id}/${modelId}`, model.limit.context);
              }
            }
          }
        }
      }
      log("Model limits loaded", { count: modelLimits.size });
    } catch (error) {
      log("Failed to fetch model limits", { error: String(error) });
    }
  })();

  const getModelLimit = (providerID: string, modelID: string): number | undefined => {
    return modelLimits.get(`${providerID}/${modelID}`);
  };

  const compactionHook =
    isConfigured() && ctx.client
      ? createCompactionHook(ctx as CompactionContext, tags, {
          threshold: CONFIG.compactionThreshold,
          getModelLimit,
        })
      : null;

  return {
    "chat.message": async (input, output) => {
      if (!isConfigured()) return;

      const start = Date.now();

      try {
        const textParts = output.parts.filter(
          (p): p is Part & { type: "text"; text: string } => p.type === "text"
        );

        if (textParts.length === 0) {
          log("chat.message: no text parts found");
          return;
        }

        const userMessage = textParts.map((p) => p.text).join("\n");

        if (!userMessage.trim()) {
          log("chat.message: empty message, skipping");
          return;
        }

        log("chat.message: processing", {
          messagePreview: userMessage.slice(0, 100),
          partsCount: output.parts.length,
          textPartsCount: textParts.length,
        });

        if (detectMemoryKeyword(userMessage)) {
          log("chat.message: memory keyword detected");
          const nudgePart: Part = {
            id: `prt_unison-nudge-${Date.now()}`,
            sessionID: input.sessionID,
            messageID: output.message.id,
            type: "text",
            text: MEMORY_NUDGE_MESSAGE,
            synthetic: true,
          };
          output.parts.push(nudgePart);
        }

        const isFirstMessage = !injectedSessions.has(input.sessionID);

        if (isFirstMessage) {
          injectedSessions.add(input.sessionID);

          let memoryContext = "";

          if (CONFIG.recallEveryPrompt) {
            const [userResult, projectResult, profileResult] = await Promise.all([
              brainClient.searchMemories(userMessage, tags.user),
              brainClient.listMemories(tags.project, CONFIG.maxProjectMemories),
              CONFIG.injectProfile ? brainClient.getProfile() : Promise.resolve(null),
            ]);

            const userHits = userResult.success ? userResult.results : [];
            const projectDocs = projectResult.success ? projectResult.memories : [];
            const profileFacts =
              profileResult && profileResult.success ? profileResult.facts : undefined;

            memoryContext = formatContextForPrompt(userHits, projectDocs, profileFacts);
          } else {
            // Inject project memories + profile on session start
            const [projectResult, profileResult] = await Promise.all([
              brainClient.listMemories(tags.project, CONFIG.maxProjectMemories),
              CONFIG.injectProfile ? brainClient.getProfile() : Promise.resolve(null),
            ]);
            const projectDocs = projectResult.success ? projectResult.memories : [];
            const profileFacts =
              profileResult && profileResult.success ? profileResult.facts : undefined;
            memoryContext = formatContextForPrompt([], projectDocs, profileFacts);
          }

          if (memoryContext) {
            const contextPart: Part = {
              id: `prt_unison-context-${Date.now()}`,
              sessionID: input.sessionID,
              messageID: output.message.id,
              type: "text",
              text: memoryContext,
              synthetic: true,
            };

            output.parts.unshift(contextPart);

            const duration = Date.now() - start;
            log("chat.message: context injected", {
              duration,
              contextLength: memoryContext.length,
            });
          }
        }
      } catch (error) {
        log("chat.message: ERROR", { error: String(error) });
      }
    },

    tool: {
      unison: tool({
        description:
          "Manage and query the Unison brain — persistent memory across sessions and projects. Use 'search' to recall knowledge, 'add' to save new knowledge, 'profile' to view compiled user profile facts, 'list' to browse memories, 'forget' to remove a memory, 'status' to check brain health.",
        args: {
          mode: tool.schema
            .enum(["add", "search", "profile", "list", "forget", "status", "help"])
            .optional(),
          content: tool.schema.string().optional(),
          query: tool.schema.string().optional(),
          kind: tool.schema
            .enum([
              "project-config",
              "architecture",
              "error-solution",
              "preference",
              "learned-pattern",
              "conversation",
            ])
            .optional(),
          scope: tool.schema.enum(["user", "project"]).optional(),
          path: tool.schema.string().optional(),
          limit: tool.schema.number().optional(),
          profileQuery: tool.schema.string().optional(),
        },
        async execute(args: {
          mode?: string;
          content?: string;
          query?: string;
          kind?: MemoryKind;
          scope?: MemoryScope;
          path?: string;
          limit?: number;
          // profile mode: optional focus query
          profileQuery?: string;
        }) {
          if (!isConfigured()) {
            return JSON.stringify({
              success: false,
              error:
                "UNISON_TOKEN not set. Set it in your environment to use the Unison brain.",
            });
          }

          const mode = args.mode ?? "help";

          try {
            switch (mode) {
              case "help": {
                return JSON.stringify({
                  success: true,
                  message: "Unison Brain Usage Guide",
                  commands: [
                    {
                      command: "add",
                      description: "Store knowledge in the brain",
                      args: ["content", "kind?", "scope?"],
                    },
                    {
                      command: "search",
                      description: "Search brain memories (hybrid keyword+semantic)",
                      args: ["query", "scope?"],
                    },
                    {
                      command: "profile",
                      description: "View compiled user profile facts from the brain",
                      args: ["limit?"],
                    },
                    {
                      command: "list",
                      description: "List recent memories",
                      args: ["scope?", "limit?"],
                    },
                    {
                      command: "forget",
                      description: "Remove a memory by path",
                      args: ["path"],
                    },
                    {
                      command: "status",
                      description: "Brain health and document counts",
                      args: [],
                    },
                  ],
                  scopes: {
                    user: "Cross-project preferences and knowledge",
                    project: "Project-specific knowledge (default)",
                  },
                  kinds: [
                    "project-config",
                    "architecture",
                    "error-solution",
                    "preference",
                    "learned-pattern",
                    "conversation",
                  ],
                });
              }

              case "add": {
                if (!args.content) {
                  return JSON.stringify({
                    success: false,
                    error: "content parameter is required for add mode",
                  });
                }

                const sanitizedContent = stripPrivateContent(args.content);
                if (isFullyPrivate(args.content)) {
                  return JSON.stringify({
                    success: false,
                    error: "Cannot store fully private content",
                  });
                }

                const scope = args.scope ?? "project";
                const tag = scope === "user" ? tags.user : tags.project;

                const result = await brainClient.addMemory(sanitizedContent, tag, {
                  kind: args.kind,
                });

                if (!result.success) {
                  return JSON.stringify({ success: false, error: result.error });
                }

                return JSON.stringify({
                  success: true,
                  message: `Memory saved to ${scope} scope`,
                  path: result.path,
                  scope,
                  kind: args.kind,
                });
              }

              case "search": {
                if (!args.query) {
                  return JSON.stringify({
                    success: false,
                    error: "query parameter is required for search mode",
                  });
                }

                const scope = args.scope;

                if (scope === "user") {
                  const result = await brainClient.searchMemories(args.query, tags.user);
                  if (!result.success) {
                    return JSON.stringify({ success: false, error: result.error });
                  }
                  return formatSearchResults(args.query, scope, result.results, args.limit);
                }

                if (scope === "project") {
                  const result = await brainClient.searchMemories(
                    args.query,
                    tags.project
                  );
                  if (!result.success) {
                    return JSON.stringify({ success: false, error: result.error });
                  }
                  return formatSearchResults(args.query, scope, result.results, args.limit);
                }

                // No scope specified: search both and merge
                const [userResult, projectResult] = await Promise.all([
                  brainClient.searchMemories(args.query, tags.user),
                  brainClient.searchMemories(args.query, tags.project),
                ]);

                const combined = [
                  ...(userResult.success ? userResult.results : []).map((r) => ({
                    ...r,
                    scope: "user" as const,
                  })),
                  ...(projectResult.success ? projectResult.results : []).map((r) => ({
                    ...r,
                    scope: "project" as const,
                  })),
                ].sort((a, b) => b.score - a.score);

                return JSON.stringify({
                  success: true,
                  query: args.query,
                  count: combined.length,
                  results: combined.slice(0, args.limit ?? 10).map((r) => ({
                    path: r.doc.path,
                    title: r.doc.title,
                    tldr: r.doc.tldr,
                    highlight: r.highlight,
                    score: Math.round(r.score * 100),
                    scope: r.scope,
                  })),
                });
              }

              case "profile": {
                const limit = args.limit ?? CONFIG.maxProfileItems;
                const result = await brainClient.getProfile(limit);

                if (!result.success) {
                  return JSON.stringify({ success: false, error: result.error });
                }

                return JSON.stringify({
                  success: true,
                  count: result.facts.length,
                  facts: result.facts.map((f) => ({
                    id: f.id,
                    predicate: f.predicate,
                    factText: f.factText,
                    objectJson: f.objectJson,
                    recordedAt: f.recordedAt,
                    confidence: f.confidence,
                  })),
                });
              }

              case "list": {
                const scope = args.scope ?? "project";
                const limit = args.limit ?? 20;
                const tag = scope === "user" ? tags.user : tags.project;

                const result = await brainClient.listMemories(tag, limit);

                if (!result.success) {
                  return JSON.stringify({ success: false, error: result.error });
                }

                return JSON.stringify({
                  success: true,
                  scope,
                  count: result.memories.length,
                  memories: result.memories.map((doc) => ({
                    path: doc.path,
                    title: doc.title,
                    tldr: doc.tldr,
                    updatedAt: doc.updatedAt,
                    tags: doc.tags,
                  })),
                });
              }

              case "forget": {
                const targetPath = args.path;
                if (!targetPath) {
                  return JSON.stringify({
                    success: false,
                    error: "path parameter is required for forget mode",
                  });
                }

                const result = await brainClient.deleteMemory(targetPath);

                if (!result.success) {
                  return JSON.stringify({ success: false, error: result.error });
                }

                return JSON.stringify({
                  success: true,
                  message: `Memory at ${targetPath} removed`,
                });
              }

              case "status": {
                const [whoami, status] = await Promise.allSettled([
                  brainClient.whoami(),
                  brainClient.brainStatus(),
                ]);

                const accountInfo =
                  whoami.status === "fulfilled" && whoami.value.success
                    ? {
                        email: whoami.value.email ?? "(unavailable)",
                        workspaceId: whoami.value.workspaceId,
                        scopes: whoami.value.scopes,
                      }
                    : null;

                const brainInfo =
                  status.status === "fulfilled"
                    ? {
                        docCount: status.value.docCount,
                        docWithEmbedding: status.value.docWithEmbedding,
                        entityCount: status.value.entityCount,
                        factCount: status.value.factCount,
                        pendingJobs: status.value.pendingJobs,
                      }
                    : null;

                return JSON.stringify({
                  success: true,
                  connected: !!accountInfo,
                  account: accountInfo,
                  brain: brainInfo,
                  projectTag: tags.project,
                  userTag: tags.user,
                });
              }

              default:
                return JSON.stringify({ success: false, error: `Unknown mode: ${mode}` });
            }
          } catch (error) {
            return JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        },
      }),
    },

    event: async (input: { event: { type: string; properties?: unknown } }) => {
      if (compactionHook) {
        await compactionHook.event(input);
      }
    },
  };
};

function formatSearchResults(
  query: string,
  scope: string | undefined,
  results: Array<{ doc: { path: string; title: string | null; tldr: string | null }; score: number; highlight?: string }>,
  limit?: number
): string {
  const hits = results.slice(0, limit ?? 10);
  return JSON.stringify({
    success: true,
    query,
    scope,
    count: hits.length,
    results: hits.map((r) => ({
      path: r.doc.path,
      title: r.doc.title,
      tldr: r.doc.tldr,
      highlight: r.highlight,
      score: Math.round(r.score * 100),
    })),
  });
}
