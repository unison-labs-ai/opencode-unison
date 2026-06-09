import type { SearchResult, BrainDocument, BrainFact } from "@unisonlabs/sdk";
import { CONFIG } from "../config.js";

function formatFactText(fact: BrainFact): string {
  if (fact.factText) return fact.factText;
  const parts: string[] = [];
  if (fact.predicate) parts.push(fact.predicate);
  if (fact.objectJson != null) parts.push(String(fact.objectJson));
  const text = parts.join(": ").trim();
  return text.length > 0 ? text : JSON.stringify(fact);
}

export function formatContextForPrompt(
  userResults: SearchResult[],
  projectDocs: BrainDocument[],
  profileFacts?: BrainFact[]
): string {
  const parts: string[] = ["[UNISON BRAIN]"];

  if (CONFIG.injectProfile && profileFacts && profileFacts.length > 0) {
    parts.push("\nUser Profile:");
    profileFacts.slice(0, CONFIG.maxProfileItems).forEach((fact) => {
      parts.push(`- ${formatFactText(fact)}`);
    });
  }

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
