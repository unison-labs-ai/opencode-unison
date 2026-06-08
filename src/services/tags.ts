import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { CONFIG } from "../config.js";

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

export function getGitEmail(): string | null {
  try {
    const email = execSync("git config user.email", { encoding: "utf-8" }).trim();
    return email || null;
  } catch {
    return null;
  }
}

export function getUserTag(): string {
  if (CONFIG.userScopeTag) return CONFIG.userScopeTag;

  const email = getGitEmail();
  if (email) {
    return `${CONFIG.tagPrefix}_user_${sha256(email)}`;
  }
  const fallback = process.env.USER ?? process.env.USERNAME ?? "anonymous";
  return `${CONFIG.tagPrefix}_user_${sha256(fallback)}`;
}

export function getProjectTag(directory: string): string {
  if (CONFIG.projectScopeTag) return CONFIG.projectScopeTag;
  return `${CONFIG.tagPrefix}_project_${sha256(directory)}`;
}

export function getTags(directory: string): { user: string; project: string } {
  return {
    user: getUserTag(),
    project: getProjectTag(directory),
  };
}
