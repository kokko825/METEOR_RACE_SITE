import assert from "node:assert/strict";
import { chooseAiDecision, type AiDifficulty } from "../app/ai-engine.js";
import {
  applyBlastSwitch,
  applyHoloSwitch,
  applyMeteor,
  applyMove,
  applyOrbitSwitch,
  applyPass,
  applyPulseSwitch,
  applyRecallItem,
  applySetupItem,
  applyUseItem,
  activePlayers,
  activeObstacles,
  activePulseDevices,
  confirmSetupItems,
  finishTurn,
  initialGameState,
  type GameState,
  type GameVariant,
  type Player,
} from "../app/game-rules.js";

{
  for (const difficulty of ["easy", "normal", "hard"] as const) {
    const state = initialGameState(9, "red", 2, false, 0, [], "classic");
    state.turnCount = 3;
    state.probes.red = { r: 7, c: 4 };
    state.probes.blue = { r: 1, c: 4 };
    const beforeDistance = 3;
    const decision = chooseAiDecision(state, difficulty, () => 0.99);
    assert.equal(decision.type, "move");
    if (decision.type === "move") {
      const afterDistance =
        Math.abs(decision.target.r - 4) + Math.abs(decision.target.c - 4);
      assert.ok(
        afterDistance <= beforeDistance,
        `${difficulty} AI must not retreat in a neutral non-item position`,
      );
    }
  }
}

{
  for (const difficulty of ["easy", "normal", "hard"] as const) {
    const state = initialGameState(9, "red", 2, false, 0, [], "classic");
    state.turnCount = 4;
    state.probes.red = { r: 5, c: 4 };
    state.probes.blue = { r: 0, c: 4 };
    const decision = chooseAiDecision(state, difficulty, () => 0.99);
    assert.equal(decision.type, "move");
    let after = applyMove(state, decision.type === "move" ? decision.target : state.probes.red);
    if (after.phase !== "over") {
      const placement = chooseAiDecision(after, difficulty, () => 0.99);
      assert.equal(placement.type, "meteor");
      if (placement.type === "meteor") {
        after = applyMeteor(after, placement.target, placement.size, placement.useCapsule).state;
      }
    }
    assert.equal(after.winner, "red", `${difficulty} AI must convert a win available this turn`);
  }
}

{
  const state = initialGameState(9, "red", 2, false, 0, [], "classic");
  state.turnCount = 4;
  state.probes.red = { r: 6, c: 4 };
  state.probes.blue = { r: 0, c: 4 };
  const move = chooseAiDecision(state, "hard", () => 0);
  assert.deepEqual(
    move,
    { type: "move", target: { r: 5, c: 4 } },
    "hard AI must see a move-plus-meteor blast win",
  );
  const afterMove = applyMove(state, move.type === "move" ? move.target : state.probes.red);
  const placement = chooseAiDecision(afterMove, "hard", () => 0);
  assert.equal(placement.type, "meteor", "hard AI must complete the blast win");
  if (placement.type === "meteor") {
    const final = applyMeteor(
      afterMove,
      placement.target,
      placement.size,
      placement.useCapsule,
    ).state;
    assert.equal(final.winner, "red", "selected meteor placement must actually win");
  }
}

{
  const state = initialGameState(9, "red", 2, false, 0, [], "classic");
  state.turnCount = 4;
  state.phase = "place";
  state.probes.red = { r: 8, c: 4 };
  state.probes.blue = { r: 0, c: 4 };
  const decision = chooseAiDecision(state, "hard", () => 0);
  assert.equal(decision.type, "meteor");
  if (decision.type === "meteor") {
    const after = applyMeteor(
      state,
      decision.target,
      decision.size,
      decision.useCapsule,
    ).state;
    const beforeDistance = 4;
    const afterDistance =
      Math.abs(after.probes.blue.r - 4) + Math.abs(after.probes.blue.c - 4);
    assert.ok(
      afterDistance > beforeDistance,
      "a meteor spent early must create concrete denial instead of being a quiet waste",
    );
  }
}

{
  const state = initialGameState(9, "red", 2, false, 0, [], "classic");
  state.turnCount = 8;
  state.phase = "place";
  state.probes.red = { r: 8, c: 4 };
  state.probes.blue = { r: 3, c: 4 };
  const decision = chooseAiDecision(state, "hard", () => 0);
  assert.equal(decision.type, "meteor", "hard AI must answer the next player's core threat");
  if (decision.type === "meteor") {
    const after = applyMeteor(
      state,
      decision.target,
      decision.size,
      decision.useCapsule,
    ).state;
    const afterDistance =
      Math.abs(after.probes.blue.r - 4) + Math.abs(after.probes.blue.c - 4);
    assert.ok(afterDistance >= 3, "the defensive blast must push the threat out of attack range");
  }
}

{
  const state = initialGameState(15, "red", 4, false, 0, ["red", "blue", "green", "yellow"], "item");
  state.phase = "move";
  state.turn = "red";
  state.players = ["red", "blue"];
  state.finishOrder = ["yellow", "green"];
  state.probes.red = { r: 8, c: 7 };
  state.probes.blue = { r: 6, c: 7 };
  const decision = chooseAiDecision(state, "hard", () => 0);
  assert.deepEqual(
    decision,
    { type: "move", target: { r: 7, c: 7 } },
    "a remaining AI must secure the best available rank instead of avoiding CORE",
  );
}

{
  for (const difficulty of ["easy", "normal", "hard"] as const) {
    const state = initialGameState(15, "red", 2, false, 0, [], "item");
    state.turn = "blue";
    state.turnCount = 1;
    state.phase = "place";
    const decision = chooseAiDecision(state, difficulty, () => 0.99);
    if (decision.type !== "meteor") continue;
    const beforeOwn = Math.abs(state.probes.blue.r - 7) + Math.abs(state.probes.blue.c - 7);
    const beforeRival = Math.abs(state.probes.red.r - 7) + Math.abs(state.probes.red.c - 7);
    const after = applyMeteor(
      state,
      decision.target,
      decision.size,
      decision.useCapsule,
    ).state;
    const afterOwn = Math.abs(after.probes.blue.r - 7) + Math.abs(after.probes.blue.c - 7);
    const afterRival = Math.abs(after.probes.red.r - 7) + Math.abs(after.probes.red.c - 7);
    assert.ok(
      afterRival <= beforeRival || afterOwn < beforeOwn,
      `${difficulty} AI must not spend its opening meteor only to blast a distant rival`,
    );
  }
}

{
  let state = initialGameState(15, "red", 4, false, 0, [], "item");
  state.turnCount = 8;
  state.phase = "place";
  state.itemHands.red = ["recall"];
  state.inventory.red = { small: 0, large: 0 };
  state.meteors = [{ r: 13, c: 1, owner: "red", size: "large", id: 99 }];
  const use = chooseAiDecision(state, "hard", () => 0);
  assert.deepEqual(use, { type: "item", kind: "recall" }, "AI should recover an exhausted, valuable meteor");
  state = applyUseItem(state, "recall");
  assert.equal(state.meteors.length, 0, "RECALL should immediately recover all owned normal meteors");
  assert.equal(state.inventory.red.large, 1, "the recovered large meteor should return to inventory");
}

{
  const state = initialGameState(15, "red", 2, false, 0, [], "item");
  state.turnCount = 5;
  state.phase = "place";
  state.itemHands.red = ["orbit"];
  state.inventory.red = { small: 0, large: 0 };
  const decision = chooseAiDecision(state, "hard", () => 0);
  assert.notDeepEqual(
    decision,
    { type: "item", kind: "orbit" },
    "AI must preserve ORBIT when every rotation is tactically neutral",
  );
}

function play(state: GameState, difficulty: AiDifficulty, seed: number) {
  let guard = 0;
  let moves = 0;
  let retreats = 0;
  const random = () => {
    seed = (Math.imul(seed >>> 0, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  while (state.phase !== "over" && guard < 260) {
    const decision = chooseAiDecision(state, difficulty, random);
    if (decision.type === "setup") {
      state = applySetupItem(state, decision.kind);
    } else if (decision.type === "confirm_setup") {
      state = confirmSetupItems(state);
    } else if (decision.type === "move") {
      const mid = Math.floor(state.size / 2);
      const before = state.probes[state.turn];
      const beforeDistance = Math.abs(before.r - mid) + Math.abs(before.c - mid);
      const afterDistance =
        Math.abs(decision.target.r - mid) + Math.abs(decision.target.c - mid);
      moves += 1;
      if (state.variant !== "item" && afterDistance > beforeDistance) retreats += 1;
      state = applyMove(state, decision.target);
    }
    else if (decision.type === "meteor") {
      state = applyMeteor(state, decision.target, decision.size, decision.useCapsule).state;
    } else if (decision.type === "item") state = applyUseItem(state, decision.kind);
    else if (decision.type === "pass") state = applyPass(state);
    else if (decision.type === "holo") state = applyHoloSwitch(state, decision.target);
    else if (decision.type === "blast") state = applyBlastSwitch(state, decision.target);
    else if (decision.type === "pulse") state = applyPulseSwitch(state, decision.target);
    else if (decision.type === "orbit") state = applyOrbitSwitch(state, decision.ring, decision.clockwise);
    else if (decision.type === "recall") state = applyRecallItem(state, decision.meteorId);
    else state = finishTurn(state, "AI skip");
    guard += 1;
  }
  return { state, moves, retreats };
}

const allScenarios: Array<{ variant: GameVariant; size: number; count: number }> = [
  { variant: "classic", size: 9, count: 2 },
  { variant: "classic", size: 11, count: 4 },
  { variant: "team", size: 13, count: 4 },
  { variant: "team", size: 15, count: 4 },
  { variant: "item", size: 15, count: 4 },
  { variant: "team-item", size: 15, count: 4 },
];
const scenarioFilter = process.env.AI_LAB_SCENARIO;
const scenarios = scenarioFilter
  ? allScenarios.filter(({ variant, size }) => `${variant}-${size}` === scenarioFilter)
  : allScenarios;

const requestedDifficulty = process.argv[2] as AiDifficulty | undefined;
const difficulties: AiDifficulty[] = requestedDifficulty
  ? [requestedDifficulty]
  : ["easy", "normal", "hard"];

for (const difficulty of difficulties) {
  for (const scenario of scenarios) {
    const wins: Record<string, number> = { red: 0, blue: 0, green: 0, yellow: 0, draw: 0 };
    let turns = 0;
    let moves = 0;
    let retreats = 0;
    const outcomes: Array<{ winner: string; finishOrder: Player[]; active: Player[]; distances: Record<string, number>; coreBlockedBy: string[] }> = [];
    const games = Math.max(1, Number(process.env.AI_LAB_GAMES ?? 4));
    for (let index = 0; index < games; index += 1) {
      const players = (["red", "blue", "green", "yellow"] as Player[]).slice(0, scenario.count);
      const first = players[index % players.length];
      // Starting player and board rotation must vary independently. Coupling the
      // two makes a colour look stronger when the real cause is one favourable
      // first-player/starting-side combination.
      const layoutOffset = Math.floor(index / players.length) % 4;
      const initial = initialGameState(
        scenario.size,
        first,
        scenario.count,
        false,
        layoutOffset,
        players,
        scenario.variant,
      );
      const result = play(
        initial,
        difficulty,
        1009 + index * 7919 + scenario.size * 101,
      );
      const final = result.state;
      assert.equal(final.phase, "over", `${difficulty} ${scenario.variant} AI match must finish`);
      wins[final.winner ?? "draw"] += 1;
      turns += final.turnCount;
      moves += result.moves;
      retreats += result.retreats;
      const mid = Math.floor(final.size / 2);
      outcomes.push({
        winner: final.winner ?? "draw",
        finishOrder: [...(final.finishOrder ?? [])],
        active: [...activePlayers(final)],
        distances: Object.fromEntries(activePlayers(final).map((p) => [p, Math.abs(final.probes[p].r - mid) + Math.abs(final.probes[p].c - mid)])),
        coreBlockedBy: [
          ...final.meteors.filter((x) => x.r === mid && x.c === mid).map((x) => `meteor:${x.owner}`),
          ...activeObstacles(final).filter((x) => x.r === mid && x.c === mid).map((x) => `holo:${x.owner}`),
          ...activePulseDevices(final).filter((x) => x.r === mid && x.c === mid).map((x) => `pulse:${x.owner}`),
        ],
      });
    }
    console.log(
      JSON.stringify({
        difficulty,
        ...scenario,
        games,
        wins,
        averageTurns: Math.round((turns / games) * 10) / 10,
        retreatRate:
          scenario.variant === "item" || moves === 0
            ? null
            : Math.round((retreats / moves) * 1000) / 10,
        outcomes,
      }),
    );
  }
}
