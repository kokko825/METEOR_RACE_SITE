import { env } from "cloudflare:workers";
import {
  STRONG_PLAY_MAX_PER_MATCH,
  STRONG_PLAY_MIN_SCORE,
  STRONG_PLAY_RETENTION_DAYS,
  verifyStrongPlayCandidate,
  type StrongPlaySubmission,
} from "../../strong-play";
import { isTeamVariant, teamOf } from "../../game-rules";
import { rateLimitedResponse, withinRateLimit } from "../../rate-limit";

export const dynamic = "force-dynamic";
const DAY = 86_400_000;
const CATEGORIES = new Set(["finish", "escape", "multi_pressure", "advance_pressure", "self_propulsion", "future_gate", "item_swing"]);
const PLAYERS = new Set(["red", "blue", "green", "yellow"]);
const VARIANTS = new Set(["classic", "team", "item", "team-item"]);
const DIFFICULTIES = new Set(["easy", "normal", "hard"]);
let schemaEnsured = false;

async function ensureSchema() {
  if (schemaEnsured) return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS strong_plays (
      id TEXT PRIMARY KEY, app_version TEXT NOT NULL, difficulty TEXT NOT NULL,
      variant TEXT NOT NULL, board_size INTEGER NOT NULL, player_count INTEGER NOT NULL,
      winner TEXT NOT NULL, actor TEXT NOT NULL, category TEXT NOT NULL,
      score INTEGER NOT NULL, play_json TEXT NOT NULL, created_at INTEGER NOT NULL
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_strong_plays_category_created ON strong_plays(category, created_at)"),
  ]);
  schemaEnsured = true;
}

function validSubmission(value: unknown): value is StrongPlaySubmission {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<StrongPlaySubmission>;
  if (data.schemaVersion !== 1 || typeof data.appVersion !== "string" || !data.appVersion || data.appVersion.length > 20) return false;
  if (!DIFFICULTIES.has(String(data.difficulty))) return false;
  if (!VARIANTS.has(String(data.variant)) || !PLAYERS.has(String(data.winner))) return false;
  if (![9, 11, 13, 15].includes(Number(data.boardSize)) || ![2, 3, 4].includes(Number(data.playerCount))) return false;
  if (!Number.isInteger(data.turnCount) || Number(data.turnCount) < 1 || Number(data.turnCount) > 2000) return false;
  if (!Array.isArray(data.plays) || data.plays.length < 1 || data.plays.length > STRONG_PLAY_MAX_PER_MATCH) return false;
  return data.plays.every((play) =>
    play && PLAYERS.has(play.actor) && CATEGORIES.has(play.category) && Number.isInteger(play.score) &&
    play.score >= STRONG_PLAY_MIN_SCORE && play.score <= 500 &&
    Array.isArray(play.reasons) && play.reasons.length <= 6 && play.reasons.every((reason) => typeof reason === "string" && reason.length <= 60) &&
    Boolean(play.before && typeof play.before === "object") && Boolean(play.after && typeof play.after === "object"),
  );
}

export async function POST(request: Request) {
  if (!(await withinRateLimit(request, "strong-plays", 12, 3600))) return rateLimitedResponse();
  if (Number(request.headers.get("content-length") ?? 0) > 350_000) {
    return Response.json({ error: "対戦データが大きすぎます" }, { status: 413 });
  }
  let submission: unknown;
  try { submission = await request.json(); } catch { return Response.json({ error: "形式が正しくありません" }, { status: 400 }); }
  if (JSON.stringify(submission).length > 350_000) {
    return Response.json({ error: "対戦データが大きすぎます" }, { status: 413 });
  }
  if (!validSubmission(submission)) return Response.json({ error: "好プレーデータを確認できません" }, { status: 400 });
  const verifiedPlays = submission.plays.map(verifyStrongPlayCandidate);
  if (verifiedPlays.some((play) => !play)) {
    return Response.json({ error: "好プレーの評価値が一致しません" }, { status: 400 });
  }
  const sanitizedPlays = verifiedPlays.filter((play): play is NonNullable<typeof play> => Boolean(play));
  if (sanitizedPlays.some((play) =>
    play.before.size !== submission.boardSize || play.before.variant !== submission.variant ||
    play.before.players.length !== submission.playerCount ||
    !(play.actor === submission.winner ||
      (isTeamVariant(submission.variant) && teamOf(play.actor) === teamOf(submission.winner))),
  )) return Response.json({ error: "対戦結果と好プレーが一致しません" }, { status: 400 });
  const now = Date.now();
  await ensureSchema();
  await env.DB.batch(sanitizedPlays.map((play) => env.DB.prepare(`INSERT INTO strong_plays
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
  return Response.json({ ok: true, saved: sanitizedPlays.length }, { status: 202, headers: { "cache-control": "no-store" } });
}
