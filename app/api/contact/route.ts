import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";

async function ensureSchema() {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS contact_messages (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    email TEXT,
    nickname TEXT,
    category TEXT NOT NULL,
    message TEXT NOT NULL,
    site_version TEXT NOT NULL,
    room_code TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    created_at INTEGER NOT NULL
  )`).run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS contact_messages_created_idx ON contact_messages(created_at)").run();
}

const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";

export async function POST(request: Request) {
  const playerId = clean(request.headers.get("x-meteor-player-id"), 90);
  if (!/^player:[a-z0-9-]{20,80}$/.test(playerId)) return Response.json({ error: "プレイヤー情報を確認できません" }, { status: 401 });
  const body = await request.json() as Record<string, unknown>;
  const message = clean(body.message, 1200);
  if (message.length < 10) return Response.json({ error: "内容を10文字以上で入力してください" }, { status: 400 });
  const category = clean(body.type, 30) || "その他";
  const nickname = clean(body.nickname, 16);
  const siteVersion = clean(body.version, 20) || "unknown";
  const roomCode = clean(body.roomCode, 12) || null;
  const email = clean(request.headers.get("cf-access-authenticated-user-email") ?? request.headers.get("oai-authenticated-user-email"), 160) || null;
  const id = crypto.randomUUID();
  await ensureSchema();
  await env.DB.prepare(`INSERT INTO contact_messages
    (id, player_id, email, nickname, category, message, site_version, room_code, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, playerId, email, nickname, category, message, siteVersion, roomCode, Date.now())
    .run();
  return Response.json({ ok: true, reference: id.slice(0, 8).toUpperCase() });
}
