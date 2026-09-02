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
  applyUseItem,
  canUseItem,
  applyPass,
  distance,
  legalMoves,
  isItemVariant,
  isTeamVariant,
  PLAYER_ORDER,
  samePos,
  SELECTABLE_ITEMS,
  teamOf,
  type GameState,
  type ItemKind,
  type MeteorSize,
  type Player,
  type Pos,
} from "./game-rules";
import { normalizeBalance } from "./balance-config";
import { AI_STRATEGY } from "../config/ai-strategy";

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
    if (rank >= 0) return AI_STRATEGY.score.win - rank * AI_STRATEGY.score.rankStep;
  }
  if (state.phase !== "over") return null;
  if (state.winner === "draw") return -900;
  return wonBy(state, player) ? AI_STRATEGY.score.win : -AI_STRATEGY.score.win;
}

function personality(player: Player) {
  if (player === "red") return { progress: 1.04, denial: 1, resources: 1 };
  if (player === "blue") return { progress: 1.02, denial: 1.04, resources: 1.01 };
  if (player === "green") return { progress: 1.02, denial: 1, resources: 1 };
  return { progress: 1.02, denial: 1.02, resources: 1.05 };
}

const itemReserveValue: Record<ItemKind, number> = { ...AI_STRATEGY.items.reserve };

function positionValue(state: GameState, player: Player) {
  const terminal = terminalValue(state, player);
  if (terminal !== null) return terminal;
  const players = activePlayers(state);
  const configured = normalizeBalance(state.balance);
  const teamMates = players.filter((candidate) => allied(state, candidate, player));
  const teamRunner = teamMates.reduce((best, candidate) =>
    coreDistance(state, candidate) < coreDistance(state, best) ? candidate : best,
  player);
  const styleBase = isTeamVariant(state.variant)
    ? teamRunner === player
      ? { progress: 1.14, denial: 0.92, resources: 1 }
      : { progress: 0.98, denial: 1.1, resources: 1.06 }
    : players.length === 2
      ? { progress: 1.04, denial: 0.98, resources: 1 }
      : personality(player);
  const freeForAllPacing = !isTeamVariant(state.variant) && players.length >= 4;
  const style = {
    progress: styleBase.progress * configured.aiProgressWeight / 100 * (freeForAllPacing ? 1.1 : 1),
    denial: styleBase.denial * configured.aiDenialWeight / 100 * (freeForAllPacing ? 0.94 : 1),
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
    friendProgress * AI_STRATEGY.score.ownProgress * style.progress -
    rivalProgress * AI_STRATEGY.score.rivalProgress * style.denial -
    rivalPressure * AI_STRATEGY.score.rivalPressure;

  for (const p of players) {
    const sign = allied(state, p, player) ? 1 : -1;
    const inv = state.inventory[p];
    score +=
      sign *
      (inv.small * AI_STRATEGY.score.smallMeteor +
        inv.large * AI_STRATEGY.score.largeMeteor +
        (state.capsuleMeteors?.[p] ?? 0) * AI_STRATEGY.score.capsuleMeteor +
        (state.shield?.[p] ? AI_STRATEGY.score.activeShield : 0) +
        (state.boosterMoves?.[p] ?? 0) * AI_STRATEGY.score.boosterMove) *
      (sign > 0 ? style.resources : style.denial);
    // legalMoves(state, p) is well-defined for any player regardless of whose
    // turn it actually is, so score everyone's current mobility every time —
    // not just when p happens to be state.turn. The old guard meant a rival
    // immobilized by PULSE/HOLO only registered as "bad for them" on the
    // exact snapshot where it was already their move phase; in any lookahead
    // where the turn had moved on (the common case for PULSE, whose whole
    // point is to matter on a *later* turn), a fully locked rival scored
    // identically to a fully free one.
    score += sign * Math.min(legalMoves(state, p).length, 5) * AI_STRATEGY.score.mobility;
    const heldItemValue = (state.itemHands?.[p] ?? []).reduce(
      (sum, kind) => sum + itemReserveValue[kind],
      0,
    );
    score += sign * heldItemValue * (sign > 0 ? style.resources : style.denial);
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
  let quietSeed = (state.turnCount * 97 + state.nextMeteorId * 31 + 7) >>> 0;
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
    openingCycle && rivalSetback > 0 && ownAdvance <= 0 ? AI_STRATEGY.placement.openingHarassment : 0;

  // Until somebody enters the four-cell CORE zone, direct blast harassment is
  // usually less interesting than racing or building a future gate. A surviving
  // route blocker is exempt because it creates a readable strategic problem
  // without immediately sending a distant rival backwards.
  const remoteHarassmentPenalty = rivalSetback > 0 && ownAdvance <= 0
    ? rivalSetback * AI_STRATEGY.placement.remoteHarassmentPerCell
    : 0;
  const quietGateBonus = isFutureGate && survivesAsObstacle && rivalSetback === 0
    ? AI_STRATEGY.placement.quietGate
    : 0;

  return (
    ownAdvance * AI_STRATEGY.placement.ownAdvance +
    (isFutureGate && survivesAsObstacle ? AI_STRATEGY.placement.futureGate : 0) +
    quietGateBonus -
    rivalSetback * AI_STRATEGY.placement.rivalSetback -
    openingHarassmentPenalty -
    remoteHarassmentPenalty
  );
}

function isImmediateWinAvailable(state: GameState, player: Player): boolean {
  if (state.phase === "over") return wonBy(state, player);
  const probe: GameState = { ...state, turn: player, phase: "move", bonusMove: false };
  const center = centerOf(state);
  const blockers = [...state.meteors, ...activeObstacles(state), ...activePulseDevices(state)];
  const occupiedForMeteor = (target: Pos) =>
    target.r < 0 || target.c < 0 || target.r >= state.size || target.c >= state.size ||
    samePos(target, center) || blockers.some((entry) => samePos(entry, target)) ||
    activePlayers(state).some((candidate) => candidate !== player && samePos(state.probes[candidate], target));
  const clearToCore = (from: Pos) => {
    if (from.r !== center.r && from.c !== center.c) return false;
    const dr = Math.sign(center.r - from.r);
    const dc = Math.sign(center.c - from.c);
    let current = { ...from };
    while (!samePos(current, center)) {
      current = { r: current.r + dr, c: current.c + dc };
      if (!samePos(current, center) && (
        blockers.some((entry) => samePos(entry, current)) ||
        activePlayers(state).some((candidate) => candidate !== player && samePos(state.probes[candidate], current))
      )) return false;
    }
    return true;
  };
  for (const move of legalMoves(probe, player)) {
    if (samePos(move, center)) return true;
    const distanceAfterMove = Math.abs(move.r - center.r) + Math.abs(move.c - center.c);
    if (!clearToCore(move)) continue;
    const outward = {
      r: move.r + Math.sign(move.r - center.r),
      c: move.c + Math.sign(move.c - center.c),
    };
    const shieldReduction = (state.shieldTurns?.[player] ?? 0) > 0 ? 1 : 0;
    const smallPush = Math.max(0, 1 - shieldReduction);
    const largePush = Math.max(0, 2 - shieldReduction);
    if (!occupiedForMeteor(outward) && (
      ((state.inventory[player].small > 0 || (state.capsuleMeteors?.[player] ?? 0) > 0) && distanceAfterMove <= smallPush) ||
      (state.inventory[player].large > 0 && distanceAfterMove <= largePush)
    )) return true;
    const hasBlast = isItemVariant(state.variant) && (state.itemHands?.[player] ?? []).includes("blast");
    const blastPush = Math.max(0, normalizeBalance(state.balance).blastRadius - shieldReduction);
    if (hasBlast && distanceAfterMove <= blastPush) return true;
  }
  return false;
}

function projectTimedEffectsToNextTurn(state: GameState, player: Player): GameState {
  const players = activePlayers(state);
  const currentIndex = players.indexOf(state.turn);
  const playerIndex = players.indexOf(player);
  if (currentIndex < 0 || playerIndex < 0) return state;
  const elapsedTurns = (playerIndex - currentIndex + players.length) % players.length;
  if (elapsedTurns === 0) return state;
  const shieldTurns = Object.fromEntries(
    PLAYER_ORDER.map((candidate) => [
      candidate,
      Math.max(0, (state.shieldTurns?.[candidate] ?? 0) - elapsedTurns),
    ]),
  ) as Record<Player, number>;
  const obstacles = activeObstacles(state)
    .map((obstacle) => obstacle.turns === -1
      ? obstacle
      : { ...obstacle, turns: Math.max(0, (obstacle.turns ?? 1) - elapsedTurns) })
    .filter((obstacle) => obstacle.turns === -1 || (obstacle.turns ?? 0) > 0);
  const pulseDevices = activePulseDevices(state)
    .map((device) => {
      const creationGrace = device.createdTurnCount === state.turnCount ? 1 : 0;
      return { ...device, turns: Math.max(0, device.turns - Math.max(0, elapsedTurns - creationGrace)) };
    })
    .filter((device) => device.turns > 0);
  return {
    ...state,
    shieldTurns,
    shield: Object.fromEntries(
      PLAYER_ORDER.map((candidate) => [candidate, shieldTurns[candidate] > 0]),
    ) as Record<Player, boolean>,
    obstacles,
    pulseDevices,
  };
}

/** Optimistic estimate measured in this probe's own turns, not board cells. */
export function estimateAiFinishTurns(state: GameState, player: Player) {
  state = projectTimedEffectsToNextTurn(state, player);
  if ((state.finishOrder ?? []).includes(player) || wonBy(state, player)) return 0;
  if (isImmediateWinAvailable(state, player)) return 1;

  const probe: GameState = { ...state, turn: player, phase: "move", bonusMove: false };
  const startDistance = coreDistance(state, player);
  const moves = legalMoves(probe, player);
  const bestMoveDistance = moves.length
    ? Math.min(...moves.map((move) => coreDistance({
      ...state,
      probes: { ...state.probes, [player]: move },
    }, player)))
    : startDistance;
  let remaining = startDistance;
  let large = state.inventory[player].large;
  let small = state.inventory[player].small + (state.capsuleMeteors?.[player] ?? 0);
  let blast = (state.itemHands?.[player] ?? []).includes("blast") ? 1 : 0;
  let boosterTurns = state.boosterMoves?.[player] ?? 0;
  if (boosterTurns === 0 && (state.itemHands?.[player] ?? []).includes("booster")) {
    boosterTurns = normalizeBalance(state.balance).boosterUses;
  }

  for (let turn = 1; turn <= 4; turn += 1) {
    const moveGain = turn === 1
      ? Math.max(0, startDistance - bestMoveDistance)
      : boosterTurns > 0 ? 2 : 1;
    if (boosterTurns > 0) boosterTurns -= 1;
    let propulsion = 0;
    if (large > 0) {
      propulsion = 2;
      large -= 1;
    } else if (small > 0) {
      propulsion = 1;
      small -= 1;
    } else if (blast > 0) {
      propulsion = normalizeBalance(state.balance).blastRadius;
      blast -= 1;
    }
    remaining -= moveGain + propulsion;
    if (remaining <= 0) return Math.max(2, turn);
  }
  return 5;
}

function threatPenalty(state: GameState, player: Player, difficulty: AiDifficulty) {
  if (state.phase === "over") return 0;
  const rivals = activePlayers(state).filter((p) => !allied(state, p, player));
  let penalty = 0;
  const coordinatedFourPlayerDefense =
    difficulty === "hard" &&
    !isTeamVariant(state.variant) &&
    activePlayers(state).length >= 4;
  const threatEtas = new Map(rivals.map((rival) => [rival, estimateAiFinishTurns(state, rival)]));
  const immediateThreats = rivals.filter((rival) => threatEtas.get(rival) === 1);
  const immediateThreatPenalty = difficulty === "easy"
    ? AI_STRATEGY.difficulty.easyImmediateThreatPenalty
    : difficulty === "normal"
      ? AI_STRATEGY.difficulty.normalImmediateThreatPenalty
      : AI_STRATEGY.difficulty.hardImmediateThreatPenalty;
  const delegatedRisk = difficulty === "easy"
    ? AI_STRATEGY.difficulty.easyDelegatedThreatRisk
    : difficulty === "normal"
      ? AI_STRATEGY.difficulty.normalDelegatedThreatRisk
      : AI_STRATEGY.pacing.delegatedThreatRisk;

  const hasCompetingFinishThreats = coordinatedFourPlayerDefense && immediateThreats.length > 1;
  if (hasCompetingFinishThreats) {
    const players = activePlayers(state);
    const firstIndex = players.indexOf(state.turn);
    const turnOffset = (candidate: Player) => {
      const index = players.indexOf(candidate);
      return (index - firstIndex + players.length) % players.length;
    };
    const earliestThreat = Math.min(...immediateThreats.map(turnOffset));
    const defenders = players.filter((candidate) => {
      const offset = turnOffset(candidate);
      // A probe that can finish on its own next turn is not counted as a
      // dependable defender of another leader. This prevents one remaining
      // meteor from being promised to two different emergencies.
      return offset < earliestThreat &&
        !immediateThreats.includes(candidate) &&
        !allied(state, candidate, player);
    });
    const defenseUnits = defenders.reduce((sum, defender) => {
      const inventory = state.inventory[defender];
      const meteorUnits = inventory.large > 0
        ? 2
        : inventory.small > 0 || (state.capsuleMeteors?.[defender] ?? 0) > 0
          ? 1
          : 0;
      // A defender still receives only one placement phase. Defensive items
      // are alternatives to a meteor, not extra actions, so use the stronger
      // option instead of adding both and overstating the available response.
      const hand = state.itemHands?.[defender] ?? [];
      const itemUnits = hand.some((kind) =>
        kind === "blast" || kind === "pulse" || kind === "holo" || kind === "orbit"
      ) ? 2 : 0;
      return sum + Math.max(meteorUnits, itemUnits);
    }, 0);
    const requiredUnits = immediateThreats.length * AI_STRATEGY.pacing.coordinatedThreatUnits;
    const shortage = Math.max(0, requiredUnits - defenseUnits);
    penalty += shortage > 0
      ? shortage * AI_STRATEGY.pacing.coordinatedDefenseShortage
      : immediateThreats.length * delegatedRisk;
  }
  for (const rival of rivals) {
    const threatEta = threatEtas.get(rival) ?? 5;
    if (threatEta === 1) {
      if (hasCompetingFinishThreats) continue;
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
        const meteorPower = inventory.large > 0
          ? 2
          : inventory.small > 0 || (state.capsuleMeteors?.[defender] ?? 0) > 0 ? 1 : 0;
        const hand = state.itemHands?.[defender] ?? [];
        const itemPower = hand.some((kind) =>
          kind === "blast" || kind === "pulse" || kind === "holo" || kind === "orbit"
        ) ? 2 : 0;
        return sum + Math.max(meteorPower, itemPower);
      }, 0);
      // One large meteor can take responsibility alone. Two small-only defenders
      // must temporarily cooperate; otherwise the current AI cannot delegate.
      penalty += sharedStopPower >= 2 ? delegatedRisk : immediateThreatPenalty;
      continue;
    }
    if (difficulty === "hard" && threatEta === 2) {
      const resources =
        state.inventory[rival].small +
        state.inventory[rival].large +
        (state.capsuleMeteors?.[rival] ?? 0);
      // A two-turn warning now includes BOOSTER, BLAST, meteor propulsion and
      // current mobility rather than assuming that distance three is universal.
      const multiplayer = activePlayers(state).length >= 4;
      penalty += resources > 0
        ? (multiplayer ? AI_STRATEGY.pacing.multiplayerWarningWithMeteor : AI_STRATEGY.pacing.duelWarningWithMeteor)
        : (multiplayer ? AI_STRATEGY.pacing.multiplayerWarningEmpty : AI_STRATEGY.pacing.duelWarningEmpty);
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
  if (previous && !isTeamVariant(state.variant) && activePlayers(previous).length > 2) {
    const rivals = activePlayers(previous).filter((candidate) => candidate !== player);
    const newlyFinishedRivals = (state.finishOrder ?? []).filter(
      (candidate) => candidate !== player && !(previous.finishOrder ?? []).includes(candidate),
    );
    const rivalAdvance = rivals.reduce((sum, rival) => {
      if (newlyFinishedRivals.includes(rival)) return sum;
      return sum + Math.max(0, coreDistance(previous, rival) - coreDistance(state, rival));
    }, 0);
    // Free-for-all rivals are never team-mates. Explicitly charge for pushing
    // any of them toward CORE, even when the current leader does not change;
    // otherwise the averaged pressure score can make accidental king-making
    // look beneficial. A rival CORE arrival is treated as near-terminal loss.
    score -= rivalAdvance * AI_STRATEGY.score.freeForAllRivalAdvance;
    score -= newlyFinishedRivals.length * AI_STRATEGY.score.freeForAllRivalFinish;
  }
  if (difficulty === "hard" && activePlayers(state).length >= 4) {
    // HARD still needs to close the race. Once a match has had enough time to
    // develop, steadily increase the value of the AI's own forward progress so
    // perfect-looking defensive exchanges do not repeat indefinitely.
    const overtime = Math.max(
      0,
      state.turnCount - activePlayers(state).length * AI_STRATEGY.pacing.overtimeStartsAfterRounds,
    );
    const span = Math.max(1, state.size - 1);
    const ownProgress = (span * 2 - coreDistance(state, player)) / (span * 2);
    score += overtime * ownProgress * AI_STRATEGY.pacing.overtimeProgress;
  }
  if (previous) {
    for (const candidate of activePlayers(state)) {
      if (
        allied(state, candidate, player) &&
        previous.shield?.[candidate] &&
        !state.shield?.[candidate]
      ) {
        score -= AI_STRATEGY.items.shieldLossPenalty;
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

function switchCandidateCells(state: GameState, kind?: "holo" | "blast" | "pulse") {
  const keys = new Set<string>();
  if (kind === "blast" || kind === "pulse") {
    const radius = kind === "blast"
      ? normalizeBalance(state.balance).blastRadius
      : normalizeBalance(state.balance).pulseRadius;
    for (const player of activePlayers(state)) {
      const probe = state.probes[player];
      for (let dr = -radius; dr <= radius; dr += 1) {
        for (let dc = -radius; dc <= radius; dc += 1) {
          if (Math.abs(dr) + Math.abs(dc) > radius) continue;
          const r = probe.r + dr;
          const c = probe.c + dc;
          if (r >= 0 && c >= 0 && r < state.size && c < state.size) keys.add(`${r},${c}`);
        }
      }
    }
  } else {
    for (let r = 0; r < state.size; r += 1) {
      for (let c = 0; c < state.size; c += 1) keys.add(`${r},${c}`);
    }
  }
  return [...keys].map((key) => {
    const [r, c] = key.split(",").map(Number);
    return { r, c };
  });
}

function mobilitySwing(before: GameState, after: GameState, player: Player) {
  return activePlayers(before).reduce((sum, candidate) => {
    const sign = allied(before, candidate, player) ? 1 : -1;
    return sum + sign * (probeMobility(after, candidate) - probeMobility(before, candidate));
  }, 0);
}

function targetedItemOptions(
  state: GameState,
  kind: "holo" | "blast" | "pulse",
  player: Player,
  difficulty: AiDifficulty,
) {
  const wasPulseLocked = activePulseDevices(state).some(
    (device) => distance(device, state.probes[player]) <= normalizeBalance(state.balance).pulseRadius,
  );
  const pending = applyUseItem(state, kind);
  return switchCandidateCells(pending, kind).flatMap((target) => {
    try {
      const next = kind === "holo"
        ? applyHoloSwitch(pending, target)
        : kind === "blast"
          ? applyBlastSwitch(pending, target)
          : applyPulseSwitch(pending, target);
      const tactical = kind === "holo"
        ? routeBlockPressure(next, player) - routeBlockPressure(state, player)
        : kind === "pulse"
          ? mobilitySwing(state, next, player) * AI_STRATEGY.items.pulseMobility
          : mobilitySwing(state, next, player) * AI_STRATEGY.items.blastMobility;
      const escapedPulse = kind === "blast" && wasPulseLocked && !activePulseDevices(next).some(
        (device) => distance(device, next.probes[player]) <= normalizeBalance(next.balance).pulseRadius,
      );
      return [{ choice: { target, next }, value: scoreResult(next, player, difficulty, state) + tactical +
        (escapedPulse ? AI_STRATEGY.items.pulseEscapeBonus : 0) }];
    } catch {
      return [];
    }
  }).sort((a, b) => b.value - a.value);
}

function boosterFollowupValue(state: GameState, player: Player, difficulty: AiDifficulty) {
  const probe: GameState = { ...state, turn: player, phase: "move", bonusMove: false };
  const moves = legalMoves(probe, player);
  if (!moves.length) return -80;
  return Math.max(...moves.map((move) => scoreResult(applyMove(probe, move), player, difficulty, state)));
}

function itemUseValue(state: GameState, kind: ItemKind, player: Player, difficulty: AiDifficulty) {
  if (kind === "holo" || kind === "blast" || kind === "pulse") {
    return targetedItemOptions(state, kind, player, difficulty)[0]?.value;
  }
  const pending = applyUseItem(state, kind);
  if (kind === "orbit") {
    const best = orbitOptions(pending, player, difficulty)[0];
    return best && best.choice.gain >= AI_STRATEGY.items.orbitMinimumGain
      ? scoreResult(best.choice.next, player, difficulty, state)
      : undefined;
  }
  if (kind === "booster") {
    const pulseLocked = activePulseDevices(state).some(
      (device) => distance(device, state.probes[player]) <= normalizeBalance(state.balance).pulseRadius,
    );
    return pulseLocked ? undefined : boosterFollowupValue(pending, player, difficulty);
  }
  if (kind === "shield") {
    const rivals = activePlayers(state).filter((candidate) => !allied(state, candidate, player));
    const danger = Math.min(...rivals.map((candidate) => distance(state.probes[player], state.probes[candidate])));
    const urgency = coreDistance(state, player) <= 4 || danger <= 3 ? 18 : 0;
    return scoreResult(pending, player, difficulty, state) + urgency;
  }
  if (kind === "recall") {
    const recovered = state.meteors
      .filter((meteor) => meteor.owner === player && !meteor.consumable)
      .reduce((sum, meteor) => sum + (meteor.size === "large" ? 30 : 16), 0);
    const exhausted = state.inventory[player].small + state.inventory[player].large === 0 ? 24 : 0;
    return scoreResult(pending, player, difficulty, state) + recovered + exhausted;
  }
  return scoreResult(pending, player, difficulty, state);
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
  const backwardSteps = Math.max(
    0,
    coreDistance({ ...state, probes: { ...state.probes, [player]: move } }, player) -
      coreDistance(state, player),
  );
  // Outside ITEM mode, voluntarily moving away from the CORE is almost never
  // worth a tempo. A large penalty removes routine retreating while still
  // allowing a forced defensive retreat or a move-plus-blast win to outweigh it.
  const retreatScale = normalizeBalance(state.balance).aiRetreatPenalty / 100;
  const retreatPenalty = (
    isItemVariant(state.variant)
      ? backwardSteps * (difficulty === "easy"
        ? AI_STRATEGY.difficulty.easyItemRetreatPenalty
        : AI_STRATEGY.pacing.itemRetreatPenalty)
      : backwardSteps * AI_STRATEGY.pacing.classicRetreatPenalty
  ) * retreatScale;
  const inwardSteps = Math.max(
    0,
    coreDistance(state, player) -
      coreDistance({ ...state, probes: { ...state.probes, [player]: move } }, player),
  );
  const developmentBonus = earlyItemDevelopment(state, player)
    ? inwardSteps * (
      AI_STRATEGY.pacing.earlyAdvanceBonus +
      (isItemVariant(state.variant) ? AI_STRATEGY.pacing.itemForwardTempo : 0)
    )
    : 0;
  let next = applyMove(state, move);
  if (next.phase === "place" && next.turn === player) {
    const placed = bestPlacement(next, player, difficulty);
    next = placed.choice === "pass" ? applyPass(next) : applyPlacement(next, placed.choice);
    return placed.value + developmentBonus - retreatPenalty;
  }
  let score = scoreResult(next, player, difficulty);
  score += developmentBonus - retreatPenalty;
  // A bonus move is deliberately valued as part of the same turn, not as a generic reward.
  if (next.phase === "move" && next.turn === player && next.bonusMove) {
    const continuation = legalMoves(next, player)
      .map((second) => scoreResult(applyMove(next, second), player, difficulty))
      .sort((a, b) => b - a)[0];
    if (continuation !== undefined) score = continuation + developmentBonus - retreatPenalty;
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
    return ranked[0];
  }
  const width = difficulty === "easy"
    ? Math.min(AI_STRATEGY.difficulty.easyChoiceWidth, ranked.length)
    : creative
      ? Math.min(AI_STRATEGY.difficulty.normalChoiceWidth, ranked.length)
      : Math.min(Math.max(2, AI_STRATEGY.difficulty.normalChoiceWidth - 1), ranked.length);
  const creativityScale = Math.max(0.5, Math.min(1.5, creativity / 22));
  const baseTolerance = difficulty === "easy"
    ? AI_STRATEGY.difficulty.easyChoiceTolerance
    : creative
      ? AI_STRATEGY.difficulty.normalChoiceTolerance
      : Math.round(AI_STRATEGY.difficulty.normalChoiceTolerance * 0.75);
  const tolerance = Math.round(baseTolerance * creativityScale);
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
  const itemDuel = isItemVariant(state.variant) && activePlayers(state).length === 2;
  const decisionCreativity = itemDuel ? Math.min(creativity, AI_STRATEGY.items.duelItemCreativity) : creativity;
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
    const ranked = SELECTABLE_ITEMS
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
          value:
            base[kind] - duplicatePenalty + roleBalance + synergy +
            AI_STRATEGY.items.loadoutPersonality[player][kind],
        };
      })
      .sort((a, b) => b.value - a.value);
    if (!ranked.length) return { type: "skip" };
    // Even EASY should assemble a coherent loadout. Its in-match choices may
    // be loose, but starting with three low-synergy items creates a colour/turn
    // bias before play begins rather than an understandable difficulty gap.
    const setupDifficulty = difficulty === "easy" ? "normal" : difficulty;
    const selected = selectWithDifficulty(ranked, setupDifficulty, random, true, creativity);
    if (!selected) return { type: "skip" };
    return {
      type: "setup",
      kind: selected.choice,
      target: { r: -1, c: -1 },
    };
  }
  if (state.phase === "switch") {
    const pending = state.pendingSwitches?.[0];
    if (!pending) return { type: "skip" };
    if (pending.kind === "holo" || pending.kind === "blast" || pending.kind === "pulse") {
      const ranked = switchCandidateCells(state, pending.kind).flatMap((target) => {
        try {
          const next = pending.kind === "holo"
            ? applyHoloSwitch(state, target)
            : pending.kind === "blast"
              ? applyBlastSwitch(state, target)
              : applyPulseSwitch(state, target);
          const tactical = pending.kind === "holo"
            ? routeBlockPressure(next, pending.player) - routeBlockPressure(state, pending.player)
            : pending.kind === "pulse"
              ? mobilitySwing(state, next, pending.player) * AI_STRATEGY.items.pulseMobility
              : mobilitySwing(state, next, pending.player) * AI_STRATEGY.items.blastMobility;
          return [{ choice: target, value: scoreResult(next, pending.player, difficulty, state) + tactical }];
        } catch { return []; }
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
    let ranked = moves.map((move) => ({
      choice: move,
      value: scoreMove(state, move, player, difficulty),
    }));
    // EASY is allowed to miss tactics, but it should never look broken. When
    // a sideways or forward move exists, keep voluntary retreats out of its
    // random choice pool. Its lower strength still comes from shallow threat
    // defence and wider selection among the remaining understandable moves.
    const currentDistance = coreDistance(state, player);
    const understandable = ranked.filter(({ choice }) =>
        coreDistance({ ...state, probes: { ...state.probes, [player]: choice } }, player) <= currentDistance,
    );
    if (understandable.length && difficulty === "easy") {
      ranked = understandable;
    } else if (understandable.length && difficulty === "normal") {
      const bestStable = Math.max(...understandable.map(({ value }) => value));
      const provenRetreats = ranked.filter(({ choice, value }) =>
        coreDistance({ ...state, probes: { ...state.probes, [player]: choice } }, player) > currentDistance &&
        value >= bestStable + AI_STRATEGY.difficulty.normalRetreatProofMargin,
      );
      ranked = [...understandable, ...provenRetreats];
    }
    ranked.sort((a, b) => b.value - a.value);
    const selected = selectWithDifficulty(ranked, difficulty, random, isItemVariant(state.variant) && !itemDuel, decisionCreativity);
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
  const passValue = ranked.find((entry) => entry.choice === "pass")?.value ?? -1_000_000;
  const itemThreshold = difficulty === "easy"
    ? AI_STRATEGY.items.useThresholdEasy
    : difficulty === "normal"
      ? AI_STRATEGY.items.useThresholdNormal
      : AI_STRATEGY.items.useThresholdHard;
  const usableItems = [...new Set(state.itemHands?.[player] ?? [])].filter((kind) => canUseItem(state, kind));
  for (const kind of usableItems) {
    const value = itemUseValue(state, kind, player, difficulty);
    if (value === undefined || value < passValue + itemThreshold) continue;
    ranked.push({
      choice: { target: { r: -1, c: -1 }, size: "small", useCapsule: false, itemKind: kind } as Placement & { itemKind: ItemKind },
      value,
    });
  }
  const selected = selectWithDifficulty(ranked, difficulty, random, isItemVariant(state.variant) && !itemDuel, decisionCreativity);
  if (!selected) return { type: "skip" };
  if (selected.choice === "pass") return { type: "pass" };
  if ("itemKind" in selected.choice) return { type: "item", kind: selected.choice.itemKind as ItemKind };
  return { type: "meteor", ...selected.choice };
}
