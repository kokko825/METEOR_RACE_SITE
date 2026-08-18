import assert from "node:assert/strict";
import {
  activePlayers,
  applyMeteor,
  applyMove,
  applyPass,
  finishTurn,
  initialGameState,
  legalMoves,
  samePos,
  teamOf,
  type GameState,
  type GameVariant,
  type MeteorSize,
  type Pos,
} from "../app/game-rules.js";

function validTargets(state: GameState): Pos[] {
  const mid = Math.floor(state.size / 2);
  const targets: Pos[] = [];
  for (let r = 0; r < state.size; r += 1) {
    for (let c = 0; c < state.size; c += 1) {
      const target = { r, c };
      if (
        (r === mid && c === mid) ||
        activePlayers(state).some((player) => samePos(target, state.probes[player])) ||
        state.meteors.some((meteor) => samePos(target, meteor))
      ) continue;
      targets.push(target);
    }
  }
  return targets;
}

function play(variant: GameVariant, seed: number) {
  let state = initialGameState(
    variant === "item" ? 15 : 11,
    "red",
    4,
    false,
    0,
    ["red", "blue", "green", "yellow"],
    variant,
  );
  for (let action = 0; action < 450 && state.phase !== "over"; action += 1) {
    if (state.phase === "move") {
      const moves = legalMoves(state);
      if (!moves.length) {
        state = state.bonusMove
          ? finishTurn({ ...state, bonusMove: false })
          : { ...state, phase: "place" };
        continue;
      }
      const mid = Math.floor(state.size / 2);
      moves.sort((a, b) => {
        const score = (p: Pos) => Math.abs(p.r - mid) + Math.abs(p.c - mid);
        return score(a) - score(b);
      });
      state = applyMove(state, moves[(seed + action) % Math.min(2, moves.length)]);
      continue;
    }

    const targets = validTargets(state);
    if (!targets.length) {
      state = finishTurn(state);
      continue;
    }
    const capsule = (state.capsuleMeteors?.[state.turn] ?? 0) > 0;
    let size: MeteorSize =
      state.inventory[state.turn].small > 0 ? "small" : "large";
    if (
      !capsule &&
      state.inventory[state.turn].small + state.inventory[state.turn].large === 0
    ) {
      state = state.passAvailable[state.turn] ? applyPass(state) : finishTurn(state);
      continue;
    }
    if (state.inventory[state.turn].large > 0 && (seed + action) % 4 === 0) {
      size = "large";
    }
    const target = targets[(seed * 17 + action * 7) % targets.length];
    state = applyMeteor(state, target, capsule ? "small" : size, capsule).state;
  }
  assert.equal(state.phase, "over", `${variant} simulation must terminate`);
  return { winner: state.winner, turns: state.turnCount };
}

for (const variant of ["team", "item"] as const) {
  const results = Array.from({ length: 80 }, (_, index) => play(variant, index + 1));
  assert.ok(results.every((result) => result.turns <= 120));
  if (variant === "team") {
    const teamWins = results.filter(
      (result): result is typeof result & { winner: Exclude<typeof result.winner, "draw" | null> } =>
        result.winner !== "draw" && result.winner !== null,
    );
    assert.ok(teamWins.every((result) => teamOf(result.winner) === "sun" || teamOf(result.winner) === "moon"));
  }
  const average = results.reduce((sum, result) => sum + result.turns, 0) / results.length;
  console.log(variant, { games: results.length, averageTurns: average.toFixed(1) });
}
