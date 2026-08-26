import { env } from "cloudflare:workers";
import {
  STRONG_PLAY_MAX_PER_MATCH,
  STRONG_PLAY_MIN_SCORE,
  STRONG_PLAY_RETENTION_DAYS,
  type StrongPlaySubmission,
} from "../../strong-play";
import { rateLimitedResponse, withinRateLimit } from "../../rate-limit";

export const dynamic = "force-dynamic";
const DAY = 86_400_000;
const CATEGORIES = new Set(["finish", "escape", "multi_pressure", "advance_pressure", "future_gate", "item_swing"]);

async function ensureSchema() {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS strong_plays (
      id TEXT PRIMARY KEY, app_version TEXT NOT NULL, difficulty TEXT NOT NULL,
      variant TEXT NOT NULL, board_size INTEGER NOT NULL, player_count INTEGER NOT NULL,
      winner TEXT NOT NULL, actor TEXT NOT NULL, category TEXT NOT NULL,
      score INTEGER NOT NULL, play_json TEXT NOT NULL, created_at INTEGER NOT NULL
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_strong_plays_category_created ON strong_plays(category, created_at)"),
  ]);
}

function validSubmission(value: unknown): value is StrongPlaySubmission {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<StrongPlaySubmission>;
  if (data.schemaVersion !== 1 || typeof data.appVersion !== "string" || data.appVersion.length > 20) return false;
  if (![9, 11, 13, 15].includes(Number(data.boardSize)) || ![2, 3, 4].includes(Number(data.playerCount))) return false;
  if (!Array.isArray(data.plays) || data.plays.length < 1 || data.plays.length > STRONG_PLAY_MAX_PER_MATCH) return false;
  return data.plays.every((play) =>
    play && CATEGORIES.has(play.category) && Number.isInteger(play.score) &&
    play.score >= STRONG_PLAY_MIN_SCORE && play.score <= 500 &&
    Array.isArray(play.reasons) && play.reasons.length <= 6 &&
    Boolean(play.before) && Boolean(play.after),
  );
}

export async function POST(request: Request) {
  if (!(await withinRateLimit(request, "strong-plays", 12, 3600))) return rateLimitedResponse();
  if (Number(request.headers.get("content-length") ?? 0) > 350_000) {
    return Response.json({ error: "対戦データが大きすぎます" }, { status: 413 });
  }
  let submission: unknown;
  try { submission = await request.json(); } catch { return Response.json({ error: "形式が正しくありません" }, { status: 400 }); }
  if (!validSubmission(submission)) return Response.json({ error: "好プレーデータを確認できません" }, { status: 400 });
  const now = Date.now();
  await ensureSchema();
  await env.DB.batch(submission.plays.map((play) => env.DB.prepare(`INSERT INTO strong_plays
    (id, app_version, difficulty, variant, board_size, player_count, winner,
     actor, category, score, play_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      crypto.randomUUID(), submission.appVersion, submission.difficulty.slice(0, 12),
      submission.variant, submission.boardSize, submission.playerCount, submission.winner,
      play.actor, play.category, play.score, JSON.stringify(play), now,
    )));
  await env.DB.prepare("DELETE FROM strong_plays WHERE created_at < ?")
    .bind(now - STRONG_PLAY_RETENTION_DAYS * DAY).run();
  await env.DB.prepare(`DELETE FROM strong_plays WHERE id IN (
    SELECT id FROM strong_plays ORDER BY created_at DESC LIMIT -1 OFFSET 5000
  )`).run();
  return Response.json({ ok: true, saved: submission.plays.length }, { status: 202, headers: { "cache-control": "no-store" } });
}
