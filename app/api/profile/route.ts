import { env } from "cloudflare:workers";
import { readDuelRating } from "../../duel-rating-store";

export const dynamic = "force-dynamic";

function maskedEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "連携済み";
  return `${local.slice(0, 2)}${"*".repeat(Math.max(2, Math.min(6, local.length - 2)))}@${domain}`;
}

function identity(request: Request) {
  const userId = request.headers.get("oai-authenticated-user-id")?.trim();
  const email = (request.headers.get("cf-access-authenticated-user-email") ?? request.headers.get("oai-authenticated-user-email"))?.trim().toLowerCase();
  const localId = request.headers.get("x-meteor-player-id")?.trim().toLowerCase();
  return { key: userId ? `user:${userId}` : localId && /^player:[a-z0-9-]{20,80}$/.test(localId) ? localId : null, email };
}

async function ensureProfileSchema() {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS player_profiles (
    identity_key TEXT PRIMARY KEY,
    nickname TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL
  )`).run();
}

async function publicId(key: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`meteor-race:${key}`));
  return Array.from(new Uint8Array(digest).slice(0, 5), (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

export async function GET(request: Request) {
  const current = identity(request);
  if (!current.key) return Response.json({ email: "未連携", playerId: "--------", nickname: "", synced: false });
  await ensureProfileSchema();
  const row = await env.DB.prepare("SELECT nickname FROM player_profiles WHERE identity_key = ?").bind(current.key).first<{ nickname: string }>();
  const rating = await readDuelRating(current.key);
  return Response.json({
    email: current.email ? maskedEmail(current.email) : "端末内プロフィール",
    playerId: await publicId(current.key),
    nickname: row?.nickname ?? "",
    synced: Boolean(current.email),
    classicRating: rating?.classic_rating ?? 1200,
    itemRating: rating?.item_rating ?? 1200,
    wins: rating?.wins ?? 0,
    losses: rating?.losses ?? 0,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const current = identity(request);
  if (!current.key) return Response.json({ error: "プロフィールを識別できません" }, { status: 401 });
  const body = await request.json() as { nickname?: unknown };
  const nickname = typeof body.nickname === "string" ? body.nickname.trim().slice(0, 16) : "";
  await ensureProfileSchema();
  await env.DB.prepare(`INSERT INTO player_profiles (identity_key, nickname, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(identity_key) DO UPDATE SET nickname = excluded.nickname, updated_at = excluded.updated_at`)
    .bind(current.key, nickname, Date.now()).run();
  return Response.json({ ok: true, nickname });
}
