import { env } from "cloudflare:workers";
import { EmailMessage } from "cloudflare:email";
import { withinRateLimit, rateLimitedResponse } from "../../rate-limit";

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
const CONTACT_DESTINATION = "follnest.info+Meteorrace@gmail.com";
const CONTACT_SENDER = "contact@follnest.com";

async function notifyContact(report: {
  reference: string;
  category: string;
  message: string;
  nickname: string;
  playerId: string;
  siteVersion: string;
  roomCode: string | null;
  createdAt: number;
}) {
  const binding = (env as Env & { CONTACT_EMAIL?: SendEmail }).CONTACT_EMAIL;
  if (!binding) return false;
  const sentAt = new Date(report.createdAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  const body = [
      "METEOR RACEに新しいお問い合わせが届きました。",
      "",
      `受付番号: ${report.reference}`,
      `種別: ${report.category}`,
      `送信日時: ${sentAt}`,
      `ニックネーム: ${report.nickname || "未設定"}`,
      `PLAYER ID: ${report.playerId}`,
      `サイトバージョン: ${report.siteVersion}`,
      `ルームコード: ${report.roomCode || "なし"}`,
      "",
      "内容:",
      report.message,
      "",
      "この報告はD1のcontact_messagesにも保存されています。",
    ].join("\r\n");
  const raw = [
    `From: METEOR RACE <${CONTACT_SENDER}>`,
    `To: ${CONTACT_DESTINATION}`,
    `Reply-To: ${CONTACT_SENDER}`,
    `Subject: [METEOR RACE ${report.reference}] Contact report`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    body,
  ].join("\r\n");
  await binding.send(new EmailMessage(CONTACT_SENDER, CONTACT_DESTINATION, raw));
  return true;
}

export async function POST(request: Request) {
  if (!(await withinRateLimit(request, "contact-post", 5, 600))) return rateLimitedResponse();
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
  const createdAt = Date.now();
  await ensureSchema();
  await env.DB.prepare(`INSERT INTO contact_messages
    (id, player_id, email, nickname, category, message, site_version, room_code, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, playerId, email, nickname, category, message, siteVersion, roomCode, createdAt)
    .run();
  const reference = id.slice(0, 8).toUpperCase();
  let notification: "sent" | "not_configured" | "failed" = "not_configured";
  try {
    notification = await notifyContact({ reference, category, message, nickname, playerId, siteVersion, roomCode, createdAt })
      ? "sent"
      : "not_configured";
  } catch (error) {
    // The database copy is authoritative. A mail outage must never discard or
    // reject a report that was already accepted from the player.
    console.error("Contact notification email failed", error);
    notification = "failed";
  }
  return Response.json({ ok: true, reference, notification });
}
