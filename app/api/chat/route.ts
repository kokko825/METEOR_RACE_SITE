import { env } from "cloudflare:workers";
import { withinRateLimit, rateLimitedResponse } from "../../rate-limit";
import { containsBlockedChatLanguage } from "../../chat-moderation";
import { COMMUNITY_SAFETY } from "../../../config/community-safety";

export const dynamic = "force-dynamic";

function cleanMessage(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

function playerIdFrom(request: Request) {
  const authenticated = request.headers.get("cf-access-authenticated-user-email") ??
    request.headers.get("oai-authenticated-user-email");
  if (authenticated?.trim()) return authenticated.trim().toLowerCase();
  const anonymous = request.headers.get("x-meteor-player-id")?.trim().toLowerCase() ?? "";
  return /^player:[a-z0-9-]{20,80}$/.test(anonymous) ? anonymous : null;
}

async function ensureSchema() {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS room_chat_messages (
      id TEXT PRIMARY KEY,
      room_code TEXT NOT NULL,
      player_id TEXT NOT NULL,
      nickname TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS room_chat_room_idx ON room_chat_messages(room_code, created_at)"),
  ]);
}

async function roomMember(code: string, playerId: string) {
  const room = await env.DB.prepare(
    "SELECT host_email, guest_email, player3_email, player4_email FROM game_rooms WHERE code = ?",
  ).bind(code).first<Record<string, string | null>>();
  if (!room) return false;
  return [room.host_email, room.guest_email, room.player3_email, room.player4_email].includes(playerId);
}

function response(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  if (!(await withinRateLimit(request, "chat-get", 60, 60))) return rateLimitedResponse();
  const playerId = playerIdFrom(request);
  const code = new URL(request.url).searchParams.get("code")?.trim().toUpperCase() ?? "";
  if (!playerId || !/^[A-Z2-9]{6}$/.test(code)) return response({ error: "チャットを取得できません" }, 400);
  await ensureSchema();
  if (!(await roomMember(code, playerId))) return response({ error: "ルームに参加していません" }, 403);
  const result = await env.DB.prepare(
    "SELECT id, nickname, message, created_at AS createdAt FROM room_chat_messages WHERE room_code = ? ORDER BY created_at DESC LIMIT 40",
  ).bind(code).all();
  return response({ messages: [...(result.results ?? [])].reverse() });
}

export async function POST(request: Request) {
  if (!(await withinRateLimit(request, "chat-post", COMMUNITY_SAFETY.chatPostLimit, COMMUNITY_SAFETY.chatPostWindowSeconds))) return rateLimitedResponse();
  const playerId = playerIdFrom(request);
  const body = await request.json() as { code?: string; nickname?: string; message?: string };
  const code = body.code?.trim().toUpperCase() ?? "";
  const message = cleanMessage(body.message ?? "");
  if (!playerId || !/^[A-Z2-9]{6}$/.test(code)) return response({ error: "チャットを送信できません" }, 400);
  if (!message) return response({ error: "メッセージを入力してください" }, 400);
  if (message.length > COMMUNITY_SAFETY.chatMaxLength) return response({ error: `${COMMUNITY_SAFETY.chatMaxLength}文字以内で入力してください` }, 400);
  if (containsBlockedChatLanguage(message)) return response({ error: "送信できない表現が含まれています" }, 400);
  await ensureSchema();
  if (!(await roomMember(code, playerId))) return response({ error: "ルームに参加していません" }, 403);
  const nickname = (body.nickname?.trim() || "PLAYER").slice(0, COMMUNITY_SAFETY.nicknameMaxLength);
  if (containsBlockedChatLanguage(nickname)) return response({ error: "ニックネームに使用できない表現が含まれています" }, 400);
  const createdAt = Date.now();
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO room_chat_messages (id, room_code, player_id, nickname, message, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).bind(id, code, playerId, nickname, message, createdAt).run();
  await env.DB.prepare(
    "DELETE FROM room_chat_messages WHERE room_code = ? AND id NOT IN (SELECT id FROM room_chat_messages WHERE room_code = ? ORDER BY created_at DESC LIMIT 80)",
  ).bind(code, code).run();
  await env.DB.prepare("DELETE FROM room_chat_messages WHERE created_at < ?")
    .bind(createdAt - COMMUNITY_SAFETY.chatRetentionDays * 86_400_000).run();
  return response({ message: { id, nickname, message, createdAt } }, 201);
}
