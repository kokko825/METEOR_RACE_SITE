import { env } from "cloudflare:workers";
import { isItemVariant, type GameVariant } from "./game-rules";

/**
 * D1 persistence for 真剣タイマン ratings, keyed by the same anonymous
 * identity used everywhere else (email header or device player-id — see
 * emailFrom()/identity() in the room and profile routes). The rating math
 * itself (who gains/loses how much) lives in app/duel-rating.ts as pure
 * functions; this module is only the "write it to D1" side.
 */

export type DuelRatingRow = {
  classic_rating: number;
  item_rating: number;
  wins: number;
  losses: number;
};

export async function ensureDuelRatingSchema() {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS duel_ratings (
    identity_key TEXT PRIMARY KEY,
    classic_rating INTEGER NOT NULL DEFAULT 1200,
    item_rating INTEGER NOT NULL DEFAULT 1200,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  )`).run();
}

export async function readDuelRating(identityKey: string): Promise<DuelRatingRow | null> {
  await ensureDuelRatingSchema();
  return env.DB.prepare(
    "SELECT classic_rating, item_rating, wins, losses FROM duel_ratings WHERE identity_key = ?",
  ).bind(identityKey).first<DuelRatingRow>();
}

/**
 * The only place a player's rating is ever written. Unlike the old
 * localStorage-based number (freely editable via devtools), this is
 * server-authoritative.
 */
export async function applyDuelRatingChange(identityKey: string, variant: GameVariant, delta: number) {
  await ensureDuelRatingSchema();
  const column = isItemVariant(variant) ? "item_rating" : "classic_rating";
  await env.DB.prepare(
    "INSERT INTO duel_ratings (identity_key, updated_at) VALUES (?, ?) ON CONFLICT(identity_key) DO NOTHING",
  ).bind(identityKey, Date.now()).run();
  await env.DB.prepare(
    `UPDATE duel_ratings SET ${column} = MAX(0, ${column} + ?), wins = wins + ?, losses = losses + ?, updated_at = ? WHERE identity_key = ?`,
  ).bind(delta, delta > 0 ? 1 : 0, delta <= 0 ? 1 : 0, Date.now(), identityKey).run();
}
