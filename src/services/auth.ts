import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { arch, homedir, hostname, platform } from "node:os";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { openUrl } from "./openUrl.js";

const CREDENTIALS_DIR = join(homedir(), ".unison-opencode");
export const CREDENTIALS_FILE = join(CREDENTIALS_DIR, "credentials.json");
const UNISON_APP_URL = process.env.UNISON_APP_URL ?? "https://app.unisonlabs.ai";
const AUTH_TIMEOUT = Number(process.env.UNISON_AUTH_TIMEOUT) || 5 * 60_000;
const CLIENT_NAME = "opencode";

export interface Credentials {
  token: string;
  createdAt: string;
}

export function loadCredentials(): Credentials | null {
  if (!existsSync(CREDENTIALS_FILE)) return null;
  try {
    const content = readFileSync(CREDENTIALS_FILE, "utf-8");
    return JSON.parse(content) as Credentials;
  } catch {
    return null;
  }
}

export function saveCredentials(token: string): void {
  mkdirSync(CREDENTIALS_DIR, { recursive: true, mode: 0o700 });
  const credentials: Credentials = {
    token,
    createdAt: new Date().toISOString(),
  };
  writeFileSync(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2), { mode: 0o600 });
}

export function clearCredentials(): boolean {
  if (!existsSync(CREDENTIALS_FILE)) return false;
  rmSync(CREDENTIALS_FILE);
  return true;
}

export interface AuthResult {
  success: boolean;
  token?: string;
  error?: string;
}

/**
 * Machine-auth headless flow:
 * 1. POST /v1/auth/provision  →  { apiKey, tenantId, status, emailSent }
 * 2. POST /v1/auth/verify     →  { verified, tenantId } (OTP from email)
 *
 * This function handles the browser-redirect flow for human users.
 * The local HTTP server receives the token as a query parameter on the
 * callback URL after the user authenticates in the browser.
 */
export function startAuthFlow(timeoutMs = AUTH_TIMEOUT): Promise<AuthResult> {
  return new Promise((resolve) => {
    let resolved = false;
    const stateToken = randomBytes(16).toString("hex");

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (resolved) return;

      const url = new URL(req.url || "/", "http://127.0.0.1");

      if (url.pathname === "/callback") {
        const callbackState = url.searchParams.get("state");
        if (callbackState !== stateToken) {
          res.writeHead(403, { "Content-Type": "text/html" });
          res.end(`
            <!DOCTYPE html>
            <html>
            <head><title>Error</title></head>
            <body style="font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0a0a0a; color: #fafafa;">
              <div style="text-align: center;">
                <h1 style="color: #ef4444;">Connection Failed</h1>
                <p>Invalid auth state. Please try again.</p>
              </div>
            </body>
            </html>
          `);
          resolved = true;
          clearTimeout(timer);
          server.close();
          resolve({ success: false, error: "Invalid auth state" });
          return;
        }

        // Accept both "token" and "apiKey" as the key name for compatibility
        const token =
          url.searchParams.get("token") ||
          url.searchParams.get("apiKey") ||
          url.searchParams.get("api_key");

        if (token?.startsWith("usk_")) {
          saveCredentials(token);
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`
            <!DOCTYPE html>
            <html>
            <head><title>Success</title></head>
            <body style="font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0a0a0a; color: #fafafa;">
              <div style="text-align: center;">
                <h1 style="color: #22c55e;">Connected!</h1>
                <p>You can close this window and return to your terminal.</p>
              </div>
            </body>
            </html>
          `);
          resolved = true;
          clearTimeout(timer);
          server.close();
          resolve({ success: true, token });
        } else {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(`
            <!DOCTYPE html>
            <html>
            <head><title>Error</title></head>
            <body style="font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0a0a0a; color: #fafafa;">
              <div style="text-align: center;">
                <h1 style="color: #ef4444;">Connection Failed</h1>
                <p>No token received. Please try again.</p>
              </div>
            </body>
            </html>
          `);
          resolved = true;
          clearTimeout(timer);
          server.close();
          resolve({ success: false, error: "No token received" });
        }
      } else {
        res.writeHead(404);
        res.end("Not Found");
      }
    });

    server.on("error", (err: NodeJS.ErrnoException) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve({ success: false, error: err.message });
      }
    });

    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      const callbackUrl = `http://127.0.0.1:${port}/callback?state=${stateToken}`;
      const params = new URLSearchParams({
        callback: callbackUrl,
        client: CLIENT_NAME,
        hostname: `opencode - ${hostname()}`,
        os: `${platform()}-${arch()}`,
        cwd: process.cwd(),
        cli_version: "1.0.0",
      });
      const authUrl = `${UNISON_APP_URL}/auth/agent-connect?${params.toString()}`;

      console.log("Opening browser for authentication...");
      console.log(`If it doesn't open, visit: ${authUrl}`);
      openUrl(authUrl).catch((error: Error) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          server.close();
          resolve({ success: false, error: `Failed to open browser: ${error.message}` });
        }
      });
    });

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        server.close();
        resolve({ success: false, error: "Authentication timed out" });
      }
    }, timeoutMs);
  });
}

/**
 * Headless machine-auth: provision a new account via email, then verify the OTP.
 * Returns the API key on success.
 */
export async function provisionAndVerify(
  email: string,
  otp: string,
  apiBaseUrl: string
): Promise<{ success: boolean; token?: string; error?: string }> {
  const base = apiBaseUrl.replace(/\/$/, "");
  try {
    const provRes = await fetch(`${base}/v1/auth/provision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    if (!provRes.ok) {
      const body = (await provRes.json().catch(() => ({}))) as {
        error?: { code?: string; message?: string };
      };
      const code = body?.error?.code;
      if (code === "email_registered") {
        // Account exists — use request-key flow instead
        await fetch(`${base}/v1/auth/request-key`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
      } else {
        return { success: false, error: body?.error?.message || `Provision failed: ${provRes.status}` };
      }
    }

    // Verify OTP
    const verifyRes = await fetch(`${base}/v1/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code: otp }),
    });

    if (!verifyRes.ok) {
      const body = (await verifyRes.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      return { success: false, error: body?.error?.message || `Verify failed: ${verifyRes.status}` };
    }

    const data = (await verifyRes.json()) as {
      verified: boolean;
      apiKey?: string;
      tenantId?: string;
    };

    if (!data.verified) {
      return { success: false, error: "Verification failed: not verified" };
    }

    if (!data.apiKey) {
      return { success: false, error: "Verification succeeded but no apiKey returned" };
    }

    saveCredentials(data.apiKey);
    return { success: true, token: data.apiKey };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
