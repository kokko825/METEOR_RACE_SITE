import {
  activePlayers,
  applyMeteor,
  applyMove,
  applyPass,
  distance,
  legalMoves,
  samePos,
  teamOf,
  type GameState,
  type MeteorSize,
  type Player,
  type Pos,
} from "./game-rules";

export type AiDifficulty = "easy" | "normal" | "hard";
export type AiDecision =
  | { type: "move"; target: Pos }
  | { type: "meteor"; target: Pos; size: MeteorSize; useCapsule: boolean }
  | { type: "pass" }
  | { type: "skip" };

type Scored<T> = { value: number; choice: T };
type Placement = { target: Pos; size: MeteorSize; useCapsule: boolean };

const centerOf = (state: GameState): Pos => {
  const mid = Math.floor(state.size / 2);
  return { r: mid, c: mid };
};
const coreDistance = (state: GameState, player: Player) => {
  const p = state.probes[player];
  const center = centerOf(state);
  return Math.abs(p.r - center.r) + Math.abs(p.c - center.c);
};
const allied = (state: GameState, a: Player, b: Player) =>
  a === b || (state.variant === "team" && teamOf(a) === teamOf(b));
const wonBy = (state: GameState, player: Player) =>
  state.winner !== null &&
  state.winner !== "draw" &&
  (state.winner === player ||
    (state.variant === "team" && teamOf(state.winner) === teamOf(player)));

function terminalValue(state: GameState, player: Player) {
  if (state.phase !== "over") return null;
  if (state.winner === "draw") return -900;
  return wonBy(state, player) ? 1_000_000 : -1_000_000;
}

function personality(player: Player) {
  if (player === "red") return { progress: 1.06, denial: 0.99, items: 0.98, resources: 0.99 };
  if (player === "blue") return { progress: 0.99, denial: 1.06, items: 0.99, resources: 1.01 };
  if (player === "green") return { progress: 1, denial: 0.99, items: 1.08, resources: 0.99 };
  return { progress: 0.99, denial: 1.01, items: 0.99, resources: 1.08 };
}

function positionValue(state: GameState, player: Player) {
  const terminal = terminalValue(state, player);
  if (terminal !== null) return terminal;
  const style = personality(player);
  const players = activePlayers(state);
  const friends = players.filter((p) => allied(state, p, player));
  const rivals = players.filter((p) => !allied(state, p, player));
  const span = Math.max(1, state.size - 1);
  const progress = (p: Player) => (span * 2 - coreDistance(state, p)) / (span * 2);
  const friendProgress = Math.max(...friends.map(progress));
  const rivalProgress = Math.max(...rivals.map(progress));
  const rivalPressure = rivals.reduce((sum, p) => sum + progress(p), 0) / Math.max(1, rivals.length);

  let score =
    friendProgress * 620 * style.progress -
    rivalProgress * 510 * style.denial -
    rivalPressure * 120;

  for (const p of players) {
    const sign = allied(state, p, player) ? 1 : -1;
    const inv = state.inventory[p];
    score +=
      sign *
      (inv.small * 18 +
        inv.large * 34 +
        (state.capsuleMeteors?.[p] ?? 0) * 15 +
        (state.shield?.[p] ? 26 : 0) +
        (state.boosterMoves?.[p] ?? 0) * 8) *
      (sign > 0 ? style.resources : style.denial);
    if (state.phase === "move" && state.turn === p) {
      score += sign * Math.min(legalMoves(state, p).length, 5) * 3;
    }
  }

  if (state.variant === "item") {
    for (const item of state.fieldItems) {
      const friendReach = Math.min(...friends.map((p) => distance(state.probes[p], item)));
      const rivalReach = Math.min(...rivals.map((p) => distance(state.probes[p], item)));
      const value = item.kind === "shield" ? 24 : item.kind === "booster" ? 30 : 20;
      score += (rivalReach - friendReach) * value * 0.18 * style.items;
    }
  }

  // Board meteors are useful only when they shape a route or are plausibly recoverable.
  for (const meteor of state.meteors) {
    const ownerSign = allied(state, meteor.owner, player) ? 1 : -1;
    const core = coreDistance({ ...state, probes: { ...state.probes, [player]: meteor } }, player);
    const nearProbe = Math.min(...players.map((p) => distance(state.probes[p], meteor)));
    const strategic = core <= Math.max(2, Math.floor(state.size / 4)) ? 8 : 0;
    const recoverable = nearProbe <= 3 ? 5 : -3;
    score += ownerSign * (strategic + recoverable);
  }
  return score;
}

function placements(state: GameState): Placement[] {
  if (state.phase !== "place" || state.turnCount === 0) return [];
  const result: Placement[] = [];
  const center = centerOf(state);
  const occupied = (p: Pos) =>
    samePos(p, center) ||
    activePlayers(state).some((player) => samePos(state.probes[player], p)) ||
    state.meteors.some((meteor) => samePos(meteor, p));
  const kinds: Array<{ size: MeteorSize; useCapsule: boolean }> = [];
  if (state.inventory[state.turn].small > 0) kinds.push({ size: "small", useCapsule: false });
  if (state.inventory[state.turn].large > 0) kinds.push({ size: "large", useCapsule: false });
  if ((state.capsuleMeteors?.[state.turn] ?? 0) > 0) kinds.push({ size: "small", useCapsule: true });
  const candidateKeys = new Set<string>();
  const anchors: Pos[] = [
    center,
    ...activePlayers(state).map((player) => state.probes[player]),
    ...state.meteors,
  ];
  for (const anchor of anchors) {
    for (let dr = -2; dr <= 2; dr += 1) {
      for (let dc = -2; dc <= 2; dc += 1) {
        const r = anchor.r + dr;
        const c = anchor.c + dc;
        if (r >= 0 && c >= 0 && r < state.size && c < state.size) candidateKeys.add(`${r},${c}`);
      }
    }
  }
  // Keep several quiet long-term setup squares on the routes to the core.
  for (const player of activePlayers(state)) {
    const probe = state.probes[player];
    const dr = Math.sign(center.r - probe.r);
    const dc = Math.sign(center.c - probe.c);
    for (let step = 1; step <= 4; step += 1) {
      candidateKeys.add(`${probe.r + dr * step},${probe.c + dc * step}`);
      candidateKeys.add(`${probe.r + dr * step + dc},${probe.c + dc * step + dr}`);
      candidateKeys.add(`${probe.r + dr * step - dc},${probe.c + dc * step - dr}`);
    }
  }
  for (const key of candidateKeys) {
    const [r, c] = key.split(",").map(Number);
    const target = { r, c };
    if (r >= 0 && c >= 0 && r < state.size && c < state.size && !occupied(target)) {
      for (const kind of kinds) result.push({ target, ...kind });
    }
  }
  return result;
}

function tacticalPlacements(state: GameState): Placement[] {
  const allowed = placements(state);
  const keys = new Set<string>();
  for (const player of activePlayers(state)) {
    const probe = state.probes[player];
    for (let dr = -2; dr <= 2; dr += 1) {
      for (let dc = -2; dc <= 2; dc += 1) {
        keys.add(`${probe.r + dr},${probe.c + dc}`);
      }
    }
  }
  return allowed.filter((placement) => keys.has(`${placement.target.r},${placement.target.c}`));
}

function applyPlacement(state: GameState, placement: Placement) {
  return applyMeteor(state, placement.target, placement.size, placement.useCapsule).state;
}

function isImmediateWinAvailable(state: GameState, player: Player): boolean {
  if (state.phase === "over") return wonBy(state, player);
  const probe: GameState = { ...state, turn: player, phase: "move", bonusMove: false };
  for (const move of legalMoves(probe, player)) {
    const afterMove = applyMove(probe, move);
    if (wonBy(afterMove, player)) return true;
    if (afterMove.phase === "place" && afterMove.turn === player) {
      // Only a blast close to a probe can create an immediate winner.
      const tactical = tacticalPlacements(afterMove);
      for (const placement of tactical) {
        if (wonBy(applyPlacement(afterMove, placement), player)) return true;
      }
    }
  }
  return false;
}

function threatPenalty(state: GameState, player: Player) {
  if (state.phase === "over") return 0;
  const rivals = activePlayers(state).filter((p) => !allied(state, p, player));
  let penalty = 0;
  for (const rival of rivals) {
    const close = coreDistance(state, rival) <= 2;
    if (close && isImmediateWinAvailable(state, rival)) penalty += 180_000;
  }
  return penalty;
}

function scoreResult(state: GameState, player: Player, previous?: GameState) {
  const terminal = terminalValue(state, player);
  if (terminal !== null) return terminal;
  let score = positionValue(state, player) - threatPenalty(state, player);
  if (previous) {
    for (const candidate of activePlayers(state)) {
      if (
        allied(state, candidate, player) &&
        previous.shield?.[candidate] &&
        !state.shield?.[candidate]
      ) {
        score -= 150;
      }
    }
  }
  return score;
}

function bestPlacement(
  state: GameState,
  player: Player,
): Scored<Placement | "pass"> {
  const options: Array<Scored<Placement | "pass">> = [];
  for (const placement of placements(state)) {
    const next = applyPlacement(state, placement);
    options.push({ choice: placement, value: scoreResult(next, player, state) });
  }
  if (state.passAvailable?.[state.turn] ?? true) {
    const next = applyPass(state);
    options.push({ choice: "pass", value: scoreResult(next, player, state) + 5 });
  }
  return options.sort((a, b) => b.value - a.value)[0] ?? { choice: "pass", value: -1_000_000 };
}

function scoreMove(state: GameState, move: Pos, player: Player) {
  let next = applyMove(state, move);
  if (next.phase === "place" && next.turn === player) {
    const placed = bestPlacement(next, player);
    next = placed.choice === "pass" ? applyPass(next) : applyPlacement(next, placed.choice);
    return placed.value;
  }
  let score = scoreResult(next, player);
  // A bonus move is deliberately valued as part of the same turn, not as a generic reward.
  if (next.phase === "move" && next.turn === player && next.bonusMove) {
    const continuation = legalMoves(next, player)
      .map((second) => scoreResult(applyMove(next, second), player))
      .sort((a, b) => b - a)[0];
    if (continuation !== undefined) score = continuation;
  }
  return score;
}

function selectWithDifficulty<T>(
  ranked: Scored<T>[],
  difficulty: AiDifficulty,
  random: () => number,
) {
  ranked.sort((a, b) => b.value - a.value);
  if (difficulty === "hard" || ranked.length === 1) return ranked[0];
  const width = difficulty === "easy" ? Math.min(5, ranked.length) : Math.min(2, ranked.length);
  const tolerance = difficulty === "easy" ? 70 : 12;
  const safe = ranked.slice(0, width).filter((x) => ranked[0].value - x.value <= tolerance);
  return safe[Math.floor(random() * safe.length)] ?? ranked[0];
}

export function chooseAiDecision(
  state: GameState,
  difficulty: AiDifficulty = "normal",
  random: () => number = Math.random,
): AiDecision {
  if (state.phase === "over") return { type: "skip" };
  const player = state.turn;
  if (state.phase === "move") {
    const moves = legalMoves(state, player);
    if (!moves.length) return { type: "skip" };
    const ranked = moves.map((move) => ({
      choice: move,
      value: scoreMove(state, move, player),
    }));
    const selected = selectWithDifficulty(ranked, difficulty, random);
    return { type: "move", target: selected.choice };
  }
  const ranked: Array<Scored<Placement | "pass">> = [];
  for (const placement of placements(state)) {
    ranked.push({
      choice: placement,
      value: scoreResult(applyPlacement(state, placement), player, state),
    });
  }
  if (state.passAvailable?.[player] ?? true) {
    ranked.push({ choice: "pass", value: scoreResult(applyPass(state), player, state) + 5 });
  }
  const selected = selectWithDifficulty(ranked, difficulty, random);
  if (!selected || selected.choice === "pass") return { type: "pass" };
  return { type: "meteor", ...selected.choice };
}
