import assert from "node:assert/strict";
import {
  applyMeteor,
  applyMove,
  activePlayers,
  finishTurn,
  initialGameState,
  legalMoves,
  samePos,
  type GameState,
  type MeteorSize,
  type Player,
  type Pos,
} from "../app/game-rules.js";

function placementTargets(state: GameState): Array<{ target: Pos; size: MeteorSize }> {
  const mid = Math.floor(state.size / 2);
  const targets: Array<{ target: Pos; size: MeteorSize }> = [];
  (["small", "large"] as MeteorSize[]).forEach((size) => {
    if (!state.inventory[state.turn][size]) return;
    for (let r = 0; r < state.size; r += 1) {
      for (let c = 0; c < state.size; c += 1) {
        const target = { r, c };
        if (
          (r === mid && c === mid) ||
          activePlayers(state).some((player) => samePos(target, state.probes[player])) ||
          state.meteors.some((meteor) => samePos(meteor, target))
        ) continue;
        const relevant =
          Math.max(Math.abs(r - state.probes.red.r), Math.abs(c - state.probes.red.c)) <= 2 ||
          Math.max(Math.abs(r - state.probes.blue.r), Math.abs(c - state.probes.blue.c)) <= 2 ||
          state.meteors.some(
            (meteor) => Math.max(Math.abs(r - meteor.r), Math.abs(c - meteor.c)) <= 2,
          );
        if (relevant) targets.push({ target, size });
      }
    }
  });
  return targets;
}

function successors(state: GameState): GameState[] {
  if (state.phase === "over") return [];
  if (state.phase === "move") return legalMoves(state).map((target) => applyMove(state, target));
  return placementTargets(state).map(({ target, size }) => applyMeteor(state, target, size).state);
}

function hasForcedWin(
  state: GameState,
  player: Player,
  depth: number,
  memo = new Map<string, boolean>(),
): boolean {
  if (state.phase === "over") return state.winner === player;
  if (depth <= 0) return false;
  const key = `${player}|${depth}|${JSON.stringify({
    turn: state.turn,
    phase: state.phase,
    probes: state.probes,
    meteors: state.meteors,
    inventory: state.inventory,
  })}`;
  const cached = memo.get(key);
  if (cached !== undefined) return cached;
  const next = successors(state);
  if (!next.length) return false;
  const result =
    state.turn === player
      ? next.some((candidate) => hasForcedWin(candidate, player, depth - 1, memo))
      : next.every((candidate) => hasForcedWin(candidate, player, depth - 1, memo));
  memo.set(key, result);
  return result;
}

{
  const state = initialGameState(9, "red");
  state.turnCount = 2;
  state.phase = "place";
  state.probes.red = { r: 4, c: 2 };
  state.probes.blue = { r: 0, c: 4 };
  state.meteors = [{ r: 4, c: 1, owner: "blue", size: "small", id: 1 }];
  state.nextMeteorId = 2;
  const resolution = applyMeteor(state, { r: 4, c: 3 }, "large");
  assert.deepEqual(
    resolution.state.probes.red,
    { r: 4, c: 2 },
    "回収対象のメテオは、探査機移動中にはまだ障害物である",
  );
  assert.equal(
    resolution.state.meteors.some((meteor) => meteor.id === 1),
    false,
    "探査機移動の判定後にメテオが回収される",
  );
  assert.equal(resolution.state.inventory.blue.small, 3);
}

{
  const state = initialGameState(9, "red");
  state.turnCount = 2;
  state.phase = "place";
  state.probes.red = { r: 4, c: 3 };
  state.probes.blue = { r: 0, c: 4 };
  const resolution = applyMeteor(state, { r: 4, c: 2 }, "small");
  assert.equal(resolution.state.winner, "red", "回収処理より先に探査機のコア到達を確定する");
  assert.deepEqual(resolution.state.probes.red, { r: 4, c: 4 });
}

for (const first of ["red", "blue"] as Player[]) {
  const opening = initialGameState(9, first);
  assert.equal(
    hasForcedWin(opening, first, 6),
    false,
    `${first}に序盤6アクション以内の強制勝利がない`,
  );
}

{
  const state = initialGameState(9, "green", 4);
  assert.equal(state.size, 11, "3・4人対戦は11×11に固定される");
  assert.deepEqual(state.players, ["red", "blue", "green", "yellow"]);
  assert.deepEqual(state.probes.red, { r: 10, c: 5 });
  assert.deepEqual(state.probes.blue, { r: 0, c: 5 });
  assert.deepEqual(state.probes.green, { r: 5, c: 0 });
  assert.deepEqual(state.probes.yellow, { r: 5, c: 10 });
  assert.equal(finishTurn(state).turn, "yellow", "4人対戦の手番が次の色へ進む");
}

{
  const state = initialGameState(9, "red", 3);
  assert.equal(state.size, 11);
  assert.deepEqual(state.players, ["red", "blue", "green"]);
  assert.equal(finishTurn({ ...state, turn: "green" }).turn, "red");
}

console.log("game-rules: all checks passed");
