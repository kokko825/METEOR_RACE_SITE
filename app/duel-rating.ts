import { isTeamVariant, type GameVariant, type Player } from "./game-rules";

/**
 * 真剣タイマン (serious 1-on-1 duel) rating math, shared between the server
 * (authoritative, in app/api/rooms/route.ts) and the client (optimistic
 * display only). Modeled on GodField's 真剣タイマン: a dedicated rated
 * ladder distinct from casual private rooms, where the number reflects
 * actual results rather than something the player can edit themselves.
 */

function teamOf(player: Player): "sun" | "moon" {
  return player === "red" || player === "yellow" ? "sun" : "moon";
}

/**
 * Rating delta for `player` given a finished match's outcome. Mirrors the
 * placement-based point table: bigger reward for 1st, harsher penalty the
 * later you place, flat penalty for a draw.
 */
export function ratingDelta(
  variant: GameVariant,
  winner: Player | "draw" | null,
  finishOrder: Player[] | undefined,
  player: Player,
): number {
  if (!winner || winner === "draw") return -5;
  if (isTeamVariant(variant)) {
    return teamOf(winner) === teamOf(player) ? 22 : -18;
  }
  const order = finishOrder?.length ? finishOrder : [winner];
  const rank = order.indexOf(player);
  const changes = order.length >= 4 ? [30, 12, -8, -20] : order.length === 3 ? [28, 8, -18] : [25, -20];
  return changes[rank >= 0 ? rank : changes.length - 1];
}

/** Penalty applied when a player abandons a 真剣タイマン match mid-game (GodField: rate drops, CPU takes over). */
export const ABANDON_PENALTY = -20;

export const RANK_TIERS = [
  { min: 2000, name: "ORBIT" },
  { min: 1800, name: "DIAMOND" },
  { min: 1600, name: "PLATINUM" },
  { min: 1400, name: "GOLD" },
  { min: 1200, name: "SILVER" },
  { min: 1000, name: "BRONZE" },
  { min: 0, name: "IRON" },
] as const;

export function rankTier(rating: number): string {
  return RANK_TIERS.find((tier) => rating >= tier.min)?.name ?? "IRON";
}
