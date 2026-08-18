import { env } from "cloudflare:workers";

async function ensureRateLimitSchema() {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS rate_limits (
    bucket_key TEXT PRIMARY KEY,
    window_start INTEGER NOT NULL,
    count INTEGER NOT NULL
  )`).run();
}

function clientKey(request: Request): string {
  // Set by Cloudflare at the edge; not something a client can spoof.
  return request.headers.get("cf-connecting-ip")?.trim() || "unknown";
}

/**
 * Fixed-window rate limiter backed by D1, keyed by real client IP + a bucket
 * name so unrelated endpoints get independent budgets. Returns true when the
 * request is within `limit` calls per `windowSeconds`, false when it should
 * be rejected (429).
 */
export async function withinRateLimit(request: Request, bucket: string, limit: number, windowSeconds: number): Promise<boolean> {
  await ensureRateLimitSchema();
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const key = `${bucket}:${clientKey(request)}:${windowStart}`;
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (bucket_key, window_start, count) VALUES (?, ?, 1)
     ON CONFLICT(bucket_key) DO UPDATE SET count = count + 1
     RETURNING count`,
  ).bind(key, windowStart).first<{ count: number }>();
  // Opportunistic cleanup of old windows so the table doesn't grow forever
  // without needing a separate cron trigger.
  if (Math.random() < 0.01) {
    await env.DB.prepare("DELETE FROM rate_limits WHERE window_start < ?")
      .bind(windowStart - windowMs * 10)
      .run();
  }
  return (row?.count ?? 1) <= limit;
}

export function rateLimitedResponse() {
  return Response.json({ error: "リクエストが多すぎます。しばらく待って再試行してください" }, { status: 429 });
}
