import { env } from "cloudflare:workers";
import { timingSafeEqual } from "node:crypto";

type AdminEnv = {
  BALANCE_ADMIN_EMAIL?: string;
  BALANCE_ADMIN_TOKEN?: string;
};

/** Constant-time string comparison (hash first so differing lengths don't short-circuit). */
async function timingSafeEqualStrings(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [hashA, hashB] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  return timingSafeEqual(new Uint8Array(hashA), new Uint8Array(hashB));
}

export async function isAdmin(request: Request): Promise<boolean> {
  const configured = String((env as unknown as AdminEnv).BALANCE_ADMIN_EMAIL ?? "")
    .trim()
    .toLowerCase();
  const current = (request.headers.get("cf-access-authenticated-user-email") ??
    request.headers.get("oai-authenticated-user-email"))?.trim().toLowerCase() ?? "";
  if (configured && current && await timingSafeEqualStrings(configured, current)) return true;

  const adminToken = String((env as unknown as AdminEnv).BALANCE_ADMIN_TOKEN ?? "");
  const suppliedToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (adminToken && suppliedToken && await timingSafeEqualStrings(adminToken, suppliedToken)) return true;

  return false;
}
