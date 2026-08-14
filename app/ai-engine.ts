import {
  activePlayers,
  activeObstacles,
  activePulseDevices,
  applyBlastSwitch,
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
  isItemVariant,
  isTeamVariant,
  samePos,
  teamOf,
  type GameState,
  type ItemKind,
  type MeteorSize,
  type Player,
  type Pos,
} from "./game-rules";
import { normalizeBalance } from "./balance-config";

export type AiDifficulty = "easy" | "normal" | "hard";
export type AiDecision =
  | { type: "setup"; target: Pos; kind: ItemKind }
  | { type: "move"; target: Pos }
  | { type: "meteor"; target: Pos; size: MeteorSize; useCapsule: boolean }
  | { type: "item"; kind: ItemKind }
  | { type: "pass" }
  | { type: "holo"; target: Pos }
  | { type: "blast"; target: Pos }
  | { type: "pulse"; target: Pos }
  | { type: "orbit"; ring: number; clockwise: boolean }
  | { type: "recall"; meteorId: number }
  | { type: "confirm_setup" }
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
  a === b || (isTeamVariant(state.variant) && teamOf(a) === teamOf(b));
const wonBy = (state: GameState, player: Player) =>
  state.winner !== null &&
  state.winner !== "draw" &&
  (state.winner === player ||
    (isTeamVariant(state.variant) && teamOf(state.winner) === teamOf(player)));

function terminalValue(state: GameState, player: Player) {
  // In free-for-all ranking matches, reaching CORE remains a decisive success
  // even when another probe has already secured first place. Treating every
  // later finisher as a loss made the remaining AIs deliberately avoid CORE
  // and play for the 120-turn draw.
  if (!isTeamVariant(state.variant)) {
    const rank = state.finishOrder?.indexOf(player) ?? -1;
    if (rank >= 0) return 1_000_000 - rank * 100_000;
  }
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
  const configured = normalizeBalance(state.balance);
  const styleBase =
    players.length === 2 || isItemVariant(state.variant) || isTeamVariant(state.variant)
      ? { progress: 1, denial: 1, items: 1, resources: 1 }
      : personality(player);
  const style = {
    progress: styleBase.progress * configured.aiProgressWeight / 100,
    denial: styleBase.denial * configured.aiDenialWeight / 100,
    items: styleBase.items * configured.aiItemWeight / 100,
    resources: styleBase.resources * configured.aiResourceWeight / 100,
  };
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

  if (isItemVariant(state.variant)) {
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
    activeObstacles(state).some((obstacle) => samePos(obstacle, p)) ||
    activePulseDevices(state).some((device) => samePos(device, p));
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
    ...(state.pulseDevices ?? []),
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

function recallMeteorValue(state: GameState, player: Player, meteor: GameState["meteors"][number]) {
  const rivals = activePlayers(state).filter((candidate) => !allied(state, candidate, player));
  const rivalDistance = Math.min(...rivals.map((candidate) => distance(state.probes[candidate], meteor)));
  const ownDistance = distance(state.probes[player], meteor);
  const centerDistance = distance(meteor, centerOf(state));
  const inventory = state.inventory[player].small + state.inventory[player].large;
  return (
    (meteor.size === "large" ? 34 : 18) +
    (inventory === 0 ? 25 : 0) +
    (rivalDistance >= 4 ? 16 : 0) +
    (ownDistance >= 4 ? 8 : 0) +
    (centerDistance >= 5 ? 6 : 0) -
    (rivalDistance <= 2 ? 22 : 0) -
    (centerDistance <= 3 ? 16 : 0)
  );
}

function plannedRecallBonus(state: GameState, placement: Placement, next: GameState) {
  if (!isItemVariant(state.variant) || !(state.itemHands?.[state.turn] ?? []).includes("recall")) return 0;
  const survives = next.meteors.some((meteor) =>
    meteor.owner === state.turn && samePos(meteor, placement.target) && !meteor.consumable,
  );
  if (!survives) return 0;
  const rivals = activePlayers(state).filter((candidate) => !allied(state, candidate, state.turn));
  const nearRival = Math.min(...rivals.map((candidate) => distance(state.probes[candidate], placement.target))) <= 4;
  const routeSetup = distance(placement.target, centerOf(state)) <= Math.floor(state.size / 3);
  return 22 + (placement.size === "large" ? 10 : 0) + (nearRival ? 8 : 0) + (routeSetup ? 6 : 0);
}

function earlyItemDevelopment(state: GameState, player: Player) {
  if (coreDistance(state, player) <= 4) return false;
  return activePlayers(state)
    .filter((candidate) => !allied(state, candidate, player))
    .every((rival) => coreDistance(state, rival) > 4);
}

function earlyPlacementStrategyBonus(state: GameState, placement: Placement, next: GameState) {
  const player = state.turn;
  if (!earlyItemDevelopment(state, player)) return 0;

  const center = centerOf(state);
  const rivals = activePlayers(state).filter((candidate) => !allied(state, candidate, player));
  const ownAdvance = coreDistance(state, player) - coreDistance(next, player);
  const rivalSetback = rivals.reduce(
    (sum, rival) => sum + Math.max(0, coreDistance(next, rival) - coreDistance(state, rival)),
    0,
  );
  const isFutureGate = rivals.some((rival) => {
    const probe = state.probes[rival];
    return samePos(placement.target, {
      r: center.r + Math.sign(probe.r - center.r),
      c: center.c + Math.sign(probe.c - center.c),
    });
  });
  const survivesAsObstacle = next.meteors.some(
    (meteor) => meteor.owner === player && samePos(meteor, placement.target),
  );
  const openingCycle = state.turnCount < activePlayers(state).length;
  const openingHarassmentPenalty =
    openingCycle && rivalSetback > 0 && ownAdvance <= 0 ? 2_500 : 0;

  // Until somebody enters the four-cell CORE zone, direct blast harassment is
  // usually less interesting than racing or building a future gate. A surviving
  // route blocker is exempt because it creates a readable strategic problem
  // without immediately sending a distant rival backwards.
  const remoteHarassmentPenalty = rivalSetback > 0 && ownAdvance <= 0 ? rivalSetback * 620 : 0;
  const quietGateBonus = isFutureGate && survivesAsObstacle && rivalSetback === 0 ? 120 : 0;

  return (
    ownAdvance * 90 +
    (isFutureGate && survivesAsObstacle ? 46 : 0) +
    quietGateBonus -
    rivalSetback * 70 -
    openingHarassmentPenalty -
    remoteHarassmentPenalty
  );
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
      if (canEnterAttackRange) {
        // In a four-probe race, treating every distance-three approach as an
        // emergency makes all AIs defend at once and stretches matches without
        // adding meaningful choices. Keep the warning strong in a duel, but
        // let multiplayer AIs continue racing until a real one-turn threat.
        const multiplayer = activePlayers(state).length >= 4;
        penalty += resources > 0
          ? (multiplayer ? 1_350 : 4_500)
          : (multiplayer ? 550 : 1_800);
      }
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
  if (difficulty === "hard" && activePlayers(state).length >= 4) {
    // HARD still needs to close the race. Once a match has had enough time to
    // develop, steadily increase the value of the AI's own forward progress so
    // perfect-looking defensive exchanges do not repeat indefinitely.
    const overtime = Math.max(0, state.turnCount - activePlayers(state).length * 4);
    const span = Math.max(1, state.size - 1);
    const ownProgress = (span * 2 - coreDistance(state, player)) / (span * 2);
    score += overtime * ownProgress * 14;
  }
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

function probeMobility(state: GameState, player: Player) {
  if (state.phase === "over") return 0;
  const probe: GameState = { ...state, turn: player, phase: "move", bonusMove: false };
  return legalMoves(probe, player).length;
}

function meteorPressure(state: GameState, player: Player) {
  const friends = activePlayers(state).filter((candidate) => allied(state, candidate, player));
  const rivals = activePlayers(state).filter((candidate) => !allied(state, candidate, player));
  return state.meteors.reduce((sum, meteor) => {
    const targets = allied(state, meteor.owner, player) ? rivals : friends;
    const nearest = Math.min(...targets.map((candidate) => distance(state.probes[candidate], meteor)));
    const pressure = Math.max(0, (meteor.size === "large" ? 4 : 3) - nearest);
    return sum + (allied(state, meteor.owner, player) ? pressure : -pressure) * 9;
  }, 0);
}

function routeBlockPressure(state: GameState, player: Player) {
  const center = centerOf(state);
  const blockers = [...state.meteors, ...activeObstacles(state)];
  return activePlayers(state).reduce((sum, candidate) => {
    const probe = state.probes[candidate];
    const blocked = blockers.reduce((count, blocker) => {
      const onRowRoute =
        blocker.r === probe.r &&
        (blocker.c - probe.c) * (center.c - blocker.c) >= 0;
      const onColumnRoute =
        blocker.c === probe.c &&
        (blocker.r - probe.r) * (center.r - blocker.r) >= 0;
      if (!onRowRoute && !onColumnRoute) return count;
      return count + Math.max(0, 5 - distance(probe, blocker));
    }, 0);
    return sum + (allied(state, candidate, player) ? -blocked : blocked) * 10;
  }, 0);
}

function orbitTacticalValue(before: GameState, after: GameState, player: Player, difficulty: AiDifficulty) {
  const players = activePlayers(before);
  const mobilitySwing = players.reduce((sum, candidate) => {
    const sign = allied(before, candidate, player) ? 1 : -1;
    return sum + sign * (probeMobility(after, candidate) - probeMobility(before, candidate)) * 7;
  }, 0);
  return (
    scoreResult(after, player, difficulty) -
    scoreResult(before, player, difficulty) +
    mobilitySwing +
    meteorPressure(after, player) -
    meteorPressure(before, player) +
    routeBlockPressure(after, player) -
    routeBlockPressure(before, player)
  );
}

function orbitOptions(state: GameState, player: Player, difficulty: AiDifficulty) {
  const options: Array<Scored<{ ring: number; clockwise: boolean; next: GameState; gain: number }>> = [];
  for (let ring = 1; ring <= Math.floor(state.size / 2); ring += 1) {
    for (const clockwise of [true, false]) {
      const next = applyOrbitSwitch(state, ring, clockwise);
      const gain = orbitTacticalValue(state, next, player, difficulty);
      options.push({ choice: { ring, clockwise, next, gain }, value: gain });
    }
  }
  return options.sort((a, b) => b.value - a.value);
}

function bestPlacement(
  state: GameState,
  player: Player,
  difficulty: AiDifficulty,
): Scored<Placement | "pass"> {
  const options: Array<Scored<Placement | "pass">> = [];
  for (const placement of placements(state)) {
    const next = applyPlacement(state, placement);
    options.push({
      choice: placement,
      value:
        scoreResult(next, player, difficulty, state) +
        plannedRecallBonus(state, placement, next) +
        earlyPlacementStrategyBonus(state, placement, next),
    });
  }
  if (state.passAvailable?.[state.turn] ?? true) {
    const next = applyPass(state);
    options.push({
      choice: "pass",
      value: scoreResult(next, player, difficulty, state) + (earlyItemDevelopment(state, player) ? 18 : 5),
    });
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
  const retreatScale = normalizeBalance(state.balance).aiRetreatPenalty / 100;
  const retreatPenalty = (isItemVariant(state.variant) ? backwardSteps * 95 : backwardSteps * 260) * retreatScale;
  const inwardSteps = Math.max(
    0,
    coreDistance(state, player) -
      coreDistance({ ...state, probes: { ...state.probes, [player]: move } }, player),
  );
  const developmentBonus = earlyItemDevelopment(state, player) ? inwardSteps * 34 : 0;
  let next = applyMove(state, move);
  if (next.phase === "place" && next.turn === player) {
    const placed = bestPlacement(next, player, difficulty);
    next = placed.choice === "pass" ? applyPass(next) : applyPlacement(next, placed.choice);
    return placed.value + pickupScore + developmentBonus - retreatPenalty;
  }
  let score = scoreResult(next, player, difficulty);
  // The item disappears and respawns after a delay, so retain the pickup reward
  // explicitly instead of relying only on the resulting board position.
  score += pickupScore + developmentBonus - retreatPenalty;
  // A bonus move is deliberately valued as part of the same turn, not as a generic reward.
  if (next.phase === "move" && next.turn === player && next.bonusMove) {
    const continuation = legalMoves(next, player)
      .map((second) => scoreResult(applyMove(next, second), player, difficulty))
      .sort((a, b) => b - a)[0];
    if (continuation !== undefined) score = continuation + pickupScore + developmentBonus - retreatPenalty;
  }
  return score;
}

function selectWithDifficulty<T>(
  ranked: Scored<T>[],
  difficulty: AiDifficulty,
  random: () => number,
  creative = false,
  creativity = 22,
) {
  ranked.sort((a, b) => b.value - a.value);
  if (!ranked.length) return undefined;
  if (ranked.length === 1) return ranked[0];
  if (difficulty === "hard") {
    if (!creative || Math.abs(ranked[0].value) >= 900_000 || random() >= creativity / 100) return ranked[0];
    const alternatives = ranked.slice(1, 5).filter((entry) => ranked[0].value - entry.value <= 18);
    return alternatives[Math.floor(random() * alternatives.length)] ?? ranked[0];
  }
  const width = difficulty === "easy"
    ? Math.min(5, ranked.length)
    : creative
      ? Math.min(3, ranked.length)
      : Math.min(2, ranked.length);
  const tolerance = difficulty === "easy" ? 70 : creative ? 24 : 12;
  const safe = ranked.slice(0, width).filter((x) => ranked[0].value - x.value <= tolerance);
  return safe[Math.floor(random() * safe.length)] ?? ranked[0];
}

export function chooseAiDecision(
  state: GameState,
  difficulty: AiDifficulty = "normal",
  random: () => number = Math.random,
): AiDecision {
  if (state.phase === "over") return { type: "skip" };
  const creativity = normalizeBalance(state.balance).aiCreativity;
  const player = state.turn;
  if (state.phase === "setup") {
    const own = state.itemHands?.[player] ?? [];
    const balance = normalizeBalance(state.balance);
    if (own.length === balance.itemHandTotal) return { type: "confirm_setup" };
    const base: Record<ItemKind, number> = {
      booster: 94,
      shield: 91,
      blast: 90,
      pulse: 90,
      holo: 87,
      orbit: 87,
      recall: 80,
      gravity: 86,
    };
    const controls: ItemKind[] = ["blast", "pulse", "holo", "orbit"];
    const ranked = (["shield", "booster", "holo", "orbit", "blast", "pulse", "recall"] as ItemKind[])
      .filter((kind) => own.filter((entry) => entry === kind).length < balance.itemSameMax)
      .map((kind) => {
        const duplicatePenalty = own.includes(kind) ? 24 : 0;
        const controlCount = own.filter((entry) => controls.includes(entry)).length;
        const roleBalance = controls.includes(kind) && controlCount >= 2 ? -18 : 0;
        const synergy =
          ((kind === "shield" && own.includes("booster")) ||
          (kind === "booster" && own.includes("shield"))) ? 5 : 0;
        return {
          choice: kind,
          value: base[kind] - duplicatePenalty + roleBalance + synergy,
        };
      })
      .sort((a, b) => b.value - a.value);
    if (!ranked.length) return { type: "skip" };
    const nearBest = ranked.filter((entry) => ranked[0].value - entry.value <= 12).slice(0, 4);
    const selected = random() < 0.55
      ? nearBest[0]
      : nearBest[1 + Math.floor(random() * Math.max(1, nearBest.length - 1))] ?? nearBest[0];
    return {
      type: "setup",
      kind: selected.choice,
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
      const selected = selectWithDifficulty(ranked, difficulty, random, true, creativity);
      return selected ? { type: "holo", target: selected.choice } : { type: "skip" };
    }
    if (pending.kind === "blast" || pending.kind === "pulse") {
      const radius = pending.kind === "blast" ? state.balance?.blastRadius ?? 1 : state.balance?.pulseRadius ?? 1;
      const ranked = cells.flatMap((target) => {
        try {
          const next = pending.kind === "blast" ? applyBlastSwitch(state, target) : applyPulseSwitch(state, target);
          const rivals = activePlayers(state).filter((p) => !allied(state, p, pending.player));
          const pushes = rivals.reduce((score, p) => {
            const range = distance(state.probes[p], target);
            return score + (pending.kind === "blast" && range >= 1 && range <= radius ? (radius - range + 1) * 120 : 0);
          }, 0);
          return [{ choice: target, value: scoreResult(next, pending.player, difficulty, state) + pushes * 0.15 }];
        }
        catch { return []; }
      });
      const selected = selectWithDifficulty(ranked, difficulty, random, true, creativity);
      return selected ? { type: pending.kind, target: selected.choice } : { type: "skip" };
    }
    if (pending.kind === "recall") {
      const owned = state.meteors.filter((meteor) => meteor.owner === pending.player && !meteor.consumable);
      const ranked = owned.map((meteor) => ({
        choice: meteor.id,
        value: recallMeteorValue(state, pending.player, meteor),
      })).concat(activeObstacles(state)
        .filter((holo) => holo.owner === pending.player)
        .map((holo) => ({
          choice: holo.id,
          value: 55 + Math.max(0, 5 - distance(holo, state.probes[pending.player])) * 8,
        })));
      const selected = selectWithDifficulty(ranked, difficulty, random, true, creativity);
      return selected ? { type: "recall", meteorId: selected.choice } : { type: "skip" };
    }
    const options = orbitOptions(state, pending.player, difficulty);
    const tolerance = difficulty === "easy" ? 10 : difficulty === "normal" ? 5 : 0;
    const viable = options.filter((entry) => options[0].value - entry.value <= tolerance);
    const selected = viable[Math.floor(random() * viable.length)] ?? options[0];
    return { type: "orbit", ring: selected.choice.ring, clockwise: selected.choice.clockwise };
  }
  if (state.phase === "move") {
    const moves = legalMoves(state, player);
    if (!moves.length) return { type: "skip" };
    const ranked = moves.map((move) => ({
      choice: move,
      value: scoreMove(state, move, player, difficulty),
    }));
    ranked.sort((a, b) => b.value - a.value);
    const usefulItemMoves = ranked.filter((entry) =>
      itemsOnMove(state, entry.choice).some((item) => itemValue(state, player, item.kind) >= 70),
    );
    const itemMove = usefulItemMoves[0];
    const selected =
      isItemVariant(state.variant) &&
      Math.abs(ranked[0].value) < 900_000 &&
      itemMove &&
      ranked[0].value - itemMove.value <= 120
        ? itemMove
        : selectWithDifficulty(ranked, difficulty, random, isItemVariant(state.variant), creativity);
    return selected ? { type: "move", target: selected.choice } : { type: "skip" };
  }
  const ranked: Array<Scored<Placement | "pass">> = [];
  for (const placement of placements(state)) {
    const next = applyPlacement(state, placement);
    ranked.push({
      choice: placement,
      value:
        scoreResult(next, player, difficulty, state) +
        plannedRecallBonus(state, placement, next) +
        earlyPlacementStrategyBonus(state, placement, next),
    });
  }
  if (state.passAvailable?.[player] ?? true) {
    ranked.push({
      choice: "pass",
      value:
        scoreResult(applyPass(state), player, difficulty, state) +
        (earlyItemDevelopment(state, player) ? 18 : 5),
    });
  }
  const rivals = activePlayers(state).filter((candidate) => !allied(state, candidate, player));
  const nearestRivalCore = Math.min(...rivals.map((candidate) => coreDistance(state, candidate)));
  const ownedMeteors = state.meteors.filter((meteor) => meteor.owner === player && !meteor.consumable);
  const ownedHolos = activeObstacles(state).filter((holo) => holo.owner === player);
  const recallValues = [
    ...ownedMeteors.map((meteor) => recallMeteorValue(state, player, meteor)),
    ...ownedHolos.map((holo) => 55 + Math.max(0, 5 - distance(holo, state.probes[player])) * 8),
  ];
  const recallOpportunity = recallValues.length
    ? Math.max(...recallValues)
    : -100;
  const itemBonuses: Partial<Record<ItemKind, number>> = {
    shield: coreDistance(state, player) <= 3 || nearestRivalCore <= 2 ? 42 : 8,
    booster: coreDistance(state, player) <= 5 ? 34 : 10,
    blast: nearestRivalCore <= 3 ? 40 : 15,
    pulse: nearestRivalCore <= 3 ? 40 : 15,
    holo: nearestRivalCore <= 4 ? 38 : 9,
    recall: recallOpportunity + 18,
    gravity: coreDistance(state, player) > 2 ? 22 : -30,
  };
  const usableItems = [...new Set(state.itemHands?.[player] ?? [])].filter((kind) => canUseItem(state, kind));
  for (const kind of usableItems) {
    const next = applyUseItem(state, kind);
    if (kind === "orbit") {
      const best = orbitOptions(next, player, difficulty)[0];
      // ORBIT is scarce: preserve it unless the best ring produces a clear tactical swing.
      if (!best || best.choice.gain < 4) continue;
      ranked.push({
        choice: { target: { r: -1, c: -1 }, size: "small", useCapsule: false, itemKind: kind } as Placement & { itemKind: ItemKind },
        value: scoreResult(best.choice.next, player, difficulty, state) - 4,
      });
      continue;
    }
    ranked.push({
      choice: { target: { r: -1, c: -1 }, size: "small", useCapsule: false, itemKind: kind } as Placement & { itemKind: ItemKind },
      value: scoreResult(next, player, difficulty, state) + (itemBonuses[kind] ?? 0),
    });
  }
  const selected = selectWithDifficulty(ranked, difficulty, random, isItemVariant(state.variant), creativity);
  if (!selected) return { type: "skip" };
  if (selected.choice === "pass") return { type: "pass" };
  if ("itemKind" in selected.choice) return { type: "item", kind: selected.choice.itemKind as ItemKind };
  return { type: "meteor", ...selected.choice };
}
