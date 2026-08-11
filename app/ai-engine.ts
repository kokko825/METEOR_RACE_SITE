import {
  activePlayers,
  activeObstacles,
  applyMeteor,
  applyMove,
  applyHoloSwitch,
  applyOrbitSwitch,
  applyPulseSwitch,
  applyRecallItem,
  applyUseItem,
  canUseItem,
  applyPass,
  distance,
  legalMoves,
  samePos,
  teamOf,
  type GameState,
  type ItemKind,
  type MeteorSize,
  type Player,
  type Pos,
} from "./game-rules";

export type AiDifficulty = "easy" | "normal" | "hard";
export type AiDecision =
  | { type: "setup"; target: Pos; kind: ItemKind }
  | { type: "move"; target: Pos }
  | { type: "meteor"; target: Pos; size: MeteorSize; useCapsule: boolean }
  | { type: "item"; kind: ItemKind }
  | { type: "pass" }
  | { type: "holo"; target: Pos }
  | { type: "pulse"; target: Pos }
  | { type: "orbit"; ring: number; clockwise: boolean }
  | { type: "recall"; meteorId: number }
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
  if (player === "red") return { progress: 1.04, denial: 1, items: 1, resources: 1 };
  if (player === "blue") return { progress: 1.02, denial: 1.04, items: 1, resources: 1.01 };
  if (player === "green") return { progress: 1.02, denial: 1, items: 1.05, resources: 1 };
  return { progress: 1.02, denial: 1.02, items: 1, resources: 1.05 };
}

function itemValue(state: GameState, player: Player, kind: GameState["fieldItems"][number]["kind"]) {
  if (kind === "shield") return state.shield?.[player] ? 12 : 105;
  if (kind === "booster") {
    const remaining = state.boosterMoves?.[player] ?? 0;
    return remaining >= 2 ? 18 : remaining === 1 ? 58 : 92;
  }
  return 78;
}

function itemsOnMove(state: GameState, move: Pos) {
  const start = state.probes[state.turn];
  const steps = distance(start, move);
  const dr = Math.sign(move.r - start.r);
  const dc = Math.sign(move.c - start.c);
  return Array.from({ length: steps }, (_, index) => ({
    r: start.r + dr * (index + 1),
    c: start.c + dc * (index + 1),
  }))
    .map((cell) => state.fieldItems.find((item) => samePos(item, cell)))
    .filter((item): item is GameState["fieldItems"][number] => Boolean(item));
}

function positionValue(state: GameState, player: Player) {
  const terminal = terminalValue(state, player);
  if (terminal !== null) return terminal;
  const players = activePlayers(state);
  const style =
    players.length === 2
      ? { progress: 1, denial: 1, items: 1, resources: 1 }
      : personality(player);
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
      const value = Math.max(...friends.map((p) => itemValue(state, p, item.kind)));
      // Nearby items should pull the route toward them, while distant items must not
      // distract the AI from racing or answering an immediate threat.
      const proximity = Math.max(0, 5 - friendReach);
      score +=
        ((rivalReach - friendReach) * value * 0.12 + proximity * value * 0.08) * style.items;
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
    state.meteors.some((meteor) => samePos(meteor, p)) ||
    activeObstacles(state).some((obstacle) => samePos(obstacle, p));
  const kinds: Array<{ size: MeteorSize; useCapsule: boolean }> = [];
  if (state.inventory[state.turn].small > 0) kinds.push({ size: "small", useCapsule: false });
  if (state.inventory[state.turn].large > 0) kinds.push({ size: "large", useCapsule: false });
  if ((state.capsuleMeteors?.[state.turn] ?? 0) > 0) kinds.push({ size: "small", useCapsule: true });
  const candidateKeys = new Set<string>();
  const anchors: Pos[] = [
    center,
    ...activePlayers(state).map((player) => state.probes[player]),
    ...state.meteors,
    ...state.fieldItems,
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
  // A few deterministic quiet squares preserve surprising long-term setups on 15×15.
  let quietSeed = ((state.itemSeed ?? 1) + state.turnCount * 97 + state.nextMeteorId * 31) >>> 0;
  for (let index = 0; index < 12; index += 1) {
    quietSeed = (Math.imul(quietSeed, 1664525) + 1013904223) >>> 0;
    const r = quietSeed % state.size;
    quietSeed = (Math.imul(quietSeed, 1664525) + 1013904223) >>> 0;
    const c = quietSeed % state.size;
    candidateKeys.add(`${r},${c}`);
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

function threatPenalty(state: GameState, player: Player, difficulty: AiDifficulty) {
  if (state.phase === "over") return 0;
  const rivals = activePlayers(state).filter((p) => !allied(state, p, player));
  let penalty = 0;
  for (const rival of rivals) {
    const rivalDistance = coreDistance(state, rival);
    if (rivalDistance <= 2 && isImmediateWinAvailable(state, rival)) {
      const players = activePlayers(state);
      const firstIndex = players.indexOf(state.turn);
      const intervening: Player[] = [];
      for (let offset = 0; offset < players.length; offset += 1) {
        const candidate = players[(firstIndex + offset) % players.length];
        if (candidate === rival) break;
        if (!allied(state, candidate, rival)) intervening.push(candidate);
      }
      const sharedStopPower = intervening.reduce((sum, defender) => {
        const inventory = state.inventory[defender];
        if (inventory.large > 0) return sum + 2;
        if (inventory.small > 0 || (state.capsuleMeteors?.[defender] ?? 0) > 0) return sum + 1;
        return sum;
      }, 0);
      // One large meteor can take responsibility alone. Two small-only defenders
      // must temporarily cooperate; otherwise the current AI cannot delegate.
      penalty += sharedStopPower >= 2 ? 320 : 180_000;
      continue;
    }
    if (difficulty === "hard" && rivalDistance === 3) {
      const probe: GameState = { ...state, turn: rival, phase: "move", bonusMove: false };
      const resources =
        state.inventory[rival].small +
        state.inventory[rival].large +
        (state.capsuleMeteors?.[rival] ?? 0);
      const canEnterAttackRange = legalMoves(probe, rival).some((move) => {
        const next = applyMove(probe, move);
        return wonBy(next, rival) || coreDistance(next, rival) <= 2;
      });
      if (canEnterAttackRange) penalty += resources > 0 ? 4_500 : 1_800;
    }
  }
  return penalty;
}

function scoreResult(
  state: GameState,
  player: Player,
  difficulty: AiDifficulty,
  previous?: GameState,
) {
  const terminal = terminalValue(state, player);
  if (terminal !== null) return terminal;
  let score = positionValue(state, player) - threatPenalty(state, player, difficulty);
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
  difficulty: AiDifficulty,
): Scored<Placement | "pass"> {
  const options: Array<Scored<Placement | "pass">> = [];
  for (const placement of placements(state)) {
    const next = applyPlacement(state, placement);
    options.push({ choice: placement, value: scoreResult(next, player, difficulty, state) });
  }
  if (state.passAvailable?.[state.turn] ?? true) {
    const next = applyPass(state);
    options.push({ choice: "pass", value: scoreResult(next, player, difficulty, state) + 5 });
  }
  return options.sort((a, b) => b.value - a.value)[0] ?? { choice: "pass", value: -1_000_000 };
}

function scoreMove(state: GameState, move: Pos, player: Player, difficulty: AiDifficulty) {
  const pickedItems = itemsOnMove(state, move);
  const pickupScore = pickedItems.reduce(
    (sum, item) => sum + itemValue(state, player, item.kind) * 2,
    0,
  );
  const backwardSteps = Math.max(
    0,
    coreDistance({ ...state, probes: { ...state.probes, [player]: move } }, player) -
      coreDistance(state, player),
  );
  // Outside ITEM mode, voluntarily moving away from the CORE is almost never
  // worth a tempo. A large penalty removes routine retreating while still
  // allowing a forced defensive retreat or a move-plus-blast win to outweigh it.
  const retreatPenalty = state.variant === "item" ? backwardSteps * 95 : backwardSteps * 260;
  let next = applyMove(state, move);
  if (next.phase === "place" && next.turn === player) {
    const placed = bestPlacement(next, player, difficulty);
    next = placed.choice === "pass" ? applyPass(next) : applyPlacement(next, placed.choice);
    return placed.value + pickupScore - retreatPenalty;
  }
  let score = scoreResult(next, player, difficulty);
  // The item disappears and respawns after a delay, so retain the pickup reward
  // explicitly instead of relying only on the resulting board position.
  score += pickupScore - retreatPenalty;
  // A bonus move is deliberately valued as part of the same turn, not as a generic reward.
  if (next.phase === "move" && next.turn === player && next.bonusMove) {
    const continuation = legalMoves(next, player)
      .map((second) => scoreResult(applyMove(next, second), player, difficulty))
      .sort((a, b) => b - a)[0];
    if (continuation !== undefined) score = continuation + pickupScore - retreatPenalty;
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
  if (state.phase === "setup") {
    const own = state.itemHands?.[player] ?? [];
    const plans: Record<Player, ItemKind[]> = {
      red: ["booster", "pulse", "shield"],
      blue: ["holo", "shield", "pulse"],
      green: ["recall", "booster", "orbit"],
      yellow: ["orbit", "holo", "pulse"],
    };
    const planned = plans[player][own.length];
    const kinds = ([planned, "pulse", "shield", "booster", "orbit", "holo", "recall"] as ItemKind[])
      .filter((kind) => kind && own.filter((entry) => entry === kind).length < 2);
    if (!kinds.length) return { type: "skip" };
    return {
      type: "setup",
      kind: kinds[0],
      target: { r: -1, c: -1 },
    };
  }
  if (state.phase === "switch") {
    const pending = state.pendingSwitches?.[0];
    if (!pending) return { type: "skip" };
    const candidateKeys = new Set<string>();
    const anchors: Pos[] = [centerOf(state), ...activePlayers(state).map((p) => state.probes[p]), ...state.meteors, ...state.fieldItems];
    for (const anchor of anchors) for (let dr = -2; dr <= 2; dr += 1) for (let dc = -2; dc <= 2; dc += 1) {
      const r = anchor.r + dr, c = anchor.c + dc;
      if (r >= 0 && c >= 0 && r < state.size && c < state.size) candidateKeys.add(`${r},${c}`);
    }
    const cells = [...candidateKeys].map((key) => {
      const [r, c] = key.split(",").map(Number); return { r, c };
    });
    if (pending.kind === "holo") {
      const rivals = activePlayers(state).filter((p) => !allied(state, p, pending.player));
      const ranked = cells.flatMap((target) => {
        try {
          applyHoloSwitch(state, target);
          const center = centerOf(state);
          const routeBlock = Math.max(...rivals.map((p) => {
            const rival = state.probes[p];
            const ahead = distance(target, center) < distance(rival, center) ? 80 : 0;
            return Math.max(0, 5 - distance(rival, target)) * 35 + ahead;
          }));
          return [{ choice: target, value: routeBlock }];
        } catch { return []; }
      });
      const selected = selectWithDifficulty(ranked, difficulty, random);
      return selected ? { type: "holo", target: selected.choice } : { type: "skip" };
    }
    if (pending.kind === "pulse") {
      const ranked = cells.flatMap((target) => {
        try {
          const next = applyPulseSwitch(state, target);
          const rivals = activePlayers(state).filter((p) => !allied(state, p, pending.player));
          const pushes = rivals.filter((p) => distance(state.probes[p], target) === 1).length * 120;
          return [{ choice: target, value: scoreResult(next, pending.player, difficulty, state) + pushes * 0.15 }];
        }
        catch { return []; }
      });
      const selected = selectWithDifficulty(ranked, difficulty, random);
      return selected ? { type: "pulse", target: selected.choice } : { type: "skip" };
    }
    if (pending.kind === "recall") {
      const owned = state.meteors.filter((meteor) => meteor.owner === pending.player && !meteor.consumable);
      const ranked = owned.map((meteor) => ({
        choice: meteor.id,
        value: distance(meteor, centerOf(state)) * 8 + (meteor.size === "large" ? 12 : 0),
      }));
      const selected = selectWithDifficulty(ranked, difficulty, random);
      return selected ? { type: "recall", meteorId: selected.choice } : { type: "skip" };
    }
    const options: Array<Scored<{ ring: number; clockwise: boolean }>> = [];
    for (let ring = 1; ring <= Math.floor(state.size / 2); ring += 1) for (const clockwise of [true, false]) {
      const next = applyOrbitSwitch(state, ring, clockwise);
      options.push({ choice: { ring, clockwise }, value: scoreResult(next, pending.player, difficulty) });
    }
    const selected = selectWithDifficulty(options, difficulty, random);
    return { type: "orbit", ...selected.choice };
  }
  if (state.phase === "move") {
    const moves = legalMoves(state, player);
    if (!moves.length) return { type: "skip" };
    const ranked = moves.map((move) => ({
      choice: move,
      value: scoreMove(state, move, player, difficulty),
    }));
    const selected = selectWithDifficulty(ranked, difficulty, random);
    return { type: "move", target: selected.choice };
  }
  const ranked: Array<Scored<Placement | "pass">> = [];
  for (const placement of placements(state)) {
    ranked.push({
      choice: placement,
      value: scoreResult(applyPlacement(state, placement), player, difficulty, state),
    });
  }
  if (state.passAvailable?.[player] ?? true) {
    ranked.push({
      choice: "pass",
      value: scoreResult(applyPass(state), player, difficulty, state) + 5,
    });
  }
  const rivals = activePlayers(state).filter((candidate) => !allied(state, candidate, player));
  const nearestRivalCore = Math.min(...rivals.map((candidate) => coreDistance(state, candidate)));
  const ownedMeteors = state.meteors.filter((meteor) => meteor.owner === player && !meteor.consumable);
  const staleMeteor = ownedMeteors.some((meteor) => distance(meteor, centerOf(state)) >= 5);
  const itemScores: Partial<Record<ItemKind, number>> = {
    shield: coreDistance(state, player) <= 3 || nearestRivalCore <= 2 ? 132 : 58,
    booster: coreDistance(state, player) <= 5 ? 108 : 68,
    pulse: nearestRivalCore <= 3 ? 126 : 88,
    orbit: nearestRivalCore <= 4 ? 116 : 82,
    holo: nearestRivalCore <= 4 ? 122 : 70,
    recall: staleMeteor ? 96 : state.inventory[player].small + state.inventory[player].large === 0 ? 22 : 62,
  };
  const usableItems = [...new Set(state.itemHands?.[player] ?? [])].filter((kind) => canUseItem(state, kind));
  for (const kind of usableItems) {
    const next = applyUseItem(state, kind);
    ranked.push({
      choice: { target: { r: -1, c: -1 }, size: "small", useCapsule: false, itemKind: kind } as Placement & { itemKind: ItemKind },
      value: (itemScores[kind] ?? 50) + (next.phase === "over" ? 100000 : 0),
    });
  }
  const selected = selectWithDifficulty(ranked, difficulty, random);
  if (!selected || selected.choice === "pass") return { type: "pass" };
  if ("itemKind" in selected.choice) return { type: "item", kind: selected.choice.itemKind as ItemKind };
  return { type: "meteor", ...selected.choice };
}
