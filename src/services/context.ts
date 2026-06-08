import type { SearchResult, BrainDocument } from "@unisonlabs/sdk";
import { CONFIG } from "../config.js";

export function formatContextForPrompt(
  userResults: SearchResult[],
  projectDocs: BrainDocument[]
): string {
  const parts: string[] = ["[UNISON BRAIN]"];

  if (projectDocs.length > 0) {
    parts.push("\nProject Knowledge:");
    projectDocs.slice(0, CONFIG.maxProjectMemories).forEach((doc) => {
      const content = doc.tldr ?? doc.title ?? doc.path;
      parts.push(`- ${content}`);
    });
  }

  if (CONFIG.injectUserMemories && userResults.length > 0) {
    parts.push("\nRelevant Memories:");
    userResults.slice(0, CONFIG.maxMemories).forEach((hit) => {
      const score = Math.round(hit.score * 100);
      const content = hit.highlight ?? hit.doc.tldr ?? hit.doc.title ?? hit.doc.path;
      parts.push(`- [${score}%] ${content}`);
    });
  }

  if (parts.length === 1) return "";
  return parts.join("\n");
}
