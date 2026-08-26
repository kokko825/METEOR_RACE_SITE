import { activePlayers, distance, isItemVariant, samePos, type GameState, type Player } from "./game-rules";

export const STRONG_PLAY_RETENTION_DAYS = 90;
export const STRONG_PLAY_MAX_PER_MATCH = 8;
export const STRONG_PLAY_MIN_SCORE = 38;

export type StrongPlayCategory =
  | "finish"
  | "escape"
  | "multi_pressure"
  | "advance_pressure"
  | "future_gate"
  | "item_swing";

export type StrongPlaySnapshot = {
  size: number;
  variant: GameState["variant"];
  players: Player[];
  turn: Player;
  phase: GameState["phase"];
  turnCount: number;
  probes: GameState["probes"];
  inventory: GameState["inventory"];
  meteors: GameState["meteors"];
  obstacles: GameState["obstacles"];
  pulseDevices: GameState["pulseDevices"];
  shieldTurns: GameState["shieldTurns"];
  boosterMoves: GameState["boosterMoves"];
  immobilizedMoves: GameState["immobilizedMoves"];
  itemHands: GameState["itemHands"];
};

export type StrongPlayCandidate = {
  actor: Player;
  category: StrongPlayCategory;
  score: number;
  reasons: string[];
  before: StrongPlaySnapshot;
  after: StrongPlaySnapshot;
};

export type StrongPlaySubmission = {
  schemaVersion: 1;
  appVersion: string;
  difficulty: string;
  variant: GameState["variant"];
  boardSize: number;
  playerCount: number;
  winner: Player;
  turnCount: number;
  plays: StrongPlayCandidate[];
};

export function strongPlaySnapshot(state: GameState): StrongPlaySnapshot {
  return structuredClone({
    size: state.size,
    variant: state.variant,
    players: activePlayers(state),
    turn: state.turn,
    phase: state.phase,
    turnCount: state.turnCount,
    probes: state.probes,
    inventory: state.inventory,
    meteors: state.meteors,
    obstacles: state.obstacles,
    pulseDevices: state.pulseDevices,
    shieldTurns: state.shieldTurns,
    boosterMoves: state.boosterMoves,
    immobilizedMoves: state.immobilizedMoves,
    itemHands: state.itemHands,
  });
}

const handSize = (state: GameState, player: Player) => state.itemHands?.[player]?.length ?? 0;

export function detectStrongPlay(before: GameState, after: GameState): StrongPlayCandidate | null {
  if (before.phase === "setup" || before.phase === "over") return null;
  const actor = before.turn;
  const players = activePlayers(before);
  const core = { r: Math.floor(before.size / 2), c: Math.floor(before.size / 2) };
  const ownProgress = distance(before.probes[actor], core) - distance(after.probes[actor], core);
  const rivals = players.filter((player) => player !== actor);
  const rivalSetbacks = rivals.map((player) =>
    distance(after.probes[player], core) - distance(before.probes[player], core),
  );
  const pressured = rivalSetbacks.filter((value) => value > 0);
  const largestSetback = Math.max(0, ...rivalSetbacks);
  const escapedThreat = rivals.some((player) =>
    distance(before.probes[player], core) <= 1 && distance(after.probes[player], core) > 1,
  );
  const itemUsed = isItemVariant(before.variant) && handSize(after, actor) < handSize(before, actor);
  const newQuietGate = after.meteors.some((meteor) =>
    meteor.owner === actor && !before.meteors.some((old) => old.id === meteor.id) &&
    distance(meteor, core) <= 2 &&
    rivals.every((player) => samePos(before.probes[player], after.probes[player])),
  );
  const actorWon = after.phase === "over" && after.winner === actor;

  let score = ownProgress * 24 + largestSetback * 18;
  const reasons: string[] = [];
  if (actorWon) { score += 100; reasons.push("勝利を確定"); }
  if (ownProgress > 0) reasons.push(`COREへ${ownProgress}マス前進`);
  if (pressured.length >= 2) { score += 34; reasons.push(`${pressured.length}機を同時に後退`); }
  if (escapedThreat) { score += 48; reasons.push("直前の勝利脅威を解除"); }
  if (ownProgress > 0 && largestSetback > 0) { score += 28; reasons.push("前進と妨害を両立"); }
  if (newQuietGate) { score += 42; reasons.push("CORE手前へ置きメテオ"); }
  if (itemUsed && (ownProgress > 0 || largestSetback > 0 || escapedThreat)) {
    score += 24;
    reasons.push("有効なアイテム使用");
  }
  if (distance(after.probes[actor], core) > distance(before.probes[actor], core)) score -= 22;
  if (score < STRONG_PLAY_MIN_SCORE || reasons.length === 0) return null;

  const category: StrongPlayCategory = actorWon
    ? "finish"
    : escapedThreat
      ? "escape"
      : pressured.length >= 2
        ? "multi_pressure"
        : ownProgress > 0 && largestSetback > 0
          ? "advance_pressure"
          : newQuietGate
            ? "future_gate"
            : "item_swing";
  return {
    actor,
    category,
    score: Math.round(score),
    reasons,
    before: strongPlaySnapshot(before),
    after: strongPlaySnapshot(after),
  };
}
