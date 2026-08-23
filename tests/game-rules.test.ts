import assert from "node:assert/strict";
import {
  applyMeteor,
  applyHoloSwitch,
  applyMove,
  applyObstacle,
  applyPass,
  applySetupItem,
  activePlayers,
  boardToViewDelta,
  coreWinner,
  finishTurn,
  confirmSetupItems,
  initialGameState,
  legalMoves,
  samePos,
  viewToBoardPos,
  type GameState,
  type MeteorSize,
  type Player,
  type Pos,
} from "../app/game-rules.js";

for (let slot = 0; slot < 4; slot += 1) {
  const home = [
    { r: 10, c: 5 },
    { r: 0, c: 5 },
    { r: 5, c: 0 },
    { r: 5, c: 10 },
  ][slot];
  assert.deepEqual(
    viewToBoardPos({ r: 10, c: 5 }, 11, slot),
    home,
    `perspective ${slot} must place its home probe at the bottom`,
  );
}

{
  let rematch = initialGameState(11, "blue", 2, false, 0, ["blue"], "item");
  assert.equal(rematch.startingPlayer, "blue", "AI can remain the next battle starter");
  assert.equal(rematch.turn, "red", "human chooses the rematch loadout before the AI");
  rematch = applySetupItem(rematch, "shield", "red");
  rematch = applySetupItem(rematch, "booster", "red");
  rematch = applySetupItem(rematch, "orbit", "red");
  rematch = confirmSetupItems(rematch, "red");
  assert.equal(rematch.turn, "blue", "AI loadout starts after the human confirms");
  rematch = applySetupItem(rematch, "blast", "blue");
  rematch = applySetupItem(rematch, "pulse", "blue");
  rematch = applySetupItem(rematch, "recall", "blue");
  rematch = confirmSetupItems(rematch, "blue");
  assert.equal(rematch.phase, "move");
  assert.equal(rematch.turn, "blue", "the original AI starter moves first after setup");
}

assert.deepEqual(boardToViewDelta({ r: -2, c: 1 }, 0), { r: -2, c: 1 });
assert.deepEqual(boardToViewDelta({ r: -2, c: 1 }, 1), { r: 2, c: -1 });
assert.deepEqual(boardToViewDelta({ r: -2, c: 1 }, 2), { r: -1, c: -2 });
assert.deepEqual(boardToViewDelta({ r: -2, c: 1 }, 3), { r: 1, c: 2 });

const threePlayerInset = initialGameState(11, "red", 3);
assert.deepEqual(threePlayerInset.probes.red, { r: 9, c: 5 });
assert.deepEqual(threePlayerInset.probes.blue, { r: 1, c: 5 });
assert.deepEqual(threePlayerInset.probes.green, { r: 5, c: 1 });

const fourPlayerInset = initialGameState(11, "red", 4);
assert.deepEqual(fourPlayerInset.probes.yellow, { r: 5, c: 9 });

const twoPlayerInset = initialGameState(11, "red", 2);
assert.deepEqual(twoPlayerInset.probes.red, { r: 9, c: 5 });
assert.deepEqual(twoPlayerInset.probes.blue, { r: 1, c: 5 });

const nineByNineEdges = initialGameState(9, "red", 2);
assert.deepEqual(nineByNineEdges.probes.red, { r: 8, c: 4 });
assert.deepEqual(nineByNineEdges.probes.blue, { r: 0, c: 4 });

{
  const state = initialGameState(11, "red", 2);
  state.turnCount = 2;
  state.inventory.red = { small: 0, large: 0 };
  const firstMove = applyMove(state, { r: 8, c: 5 });
  assert.equal(firstMove.turn, "red", "メテオ0なら1回目の移動後も同じ手番");
  assert.equal(firstMove.phase, "move");
  assert.equal(firstMove.bonusMove, true);
  assert.deepEqual(firstMove.probes.red, { r: 8, c: 5 });
  const secondMove = applyMove(firstMove, { r: 7, c: 5 });
  assert.equal(secondMove.turn, "blue", "2回目の移動後に手番を終了");
  assert.equal(secondMove.phase, "move");
  assert.equal(secondMove.bonusMove, false);
  assert.deepEqual(secondMove.probes.red, { r: 7, c: 5 });
}

{
  const state = initialGameState(11, "red", 3);
  state.turnCount = activePlayers(state).length * 14 - 1;
  const before = Object.fromEntries(
    activePlayers(state).map((player) => [player, state.inventory[player].large]),
  ) as Record<Player, number>;
  const continued = finishTurn(state);
  activePlayers(state).forEach((player) => {
    assert.equal(continued.inventory[player].large, before[player]);
  });
}

{
  const state = initialGameState(11, "red", 2);
  state.turnCount = 14;
  const before = state.inventory.red.large;
  assert.equal(finishTurn(state).inventory.red.large, before);
}

{
  const state = initialGameState(11, "green", 4);
  assert.equal(coreWinner(state, ["red", "green"]), "green");
  assert.equal(coreWinner(state, ["yellow", "blue"]), "yellow");
}

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
  assert.deepEqual(state.probes.red, { r: 9, c: 5 });
  assert.deepEqual(state.probes.blue, { r: 1, c: 5 });
  assert.deepEqual(state.probes.green, { r: 5, c: 1 });
  assert.deepEqual(state.probes.yellow, { r: 5, c: 9 });
  assert.equal(finishTurn(state).turn, "yellow", "4人対戦の手番が次の色へ進む");
}

{
  const state = initialGameState(9, "red", 3);
  assert.equal(state.size, 11);
  assert.deepEqual(state.players, ["red", "blue", "green"]);
  assert.equal(finishTurn({ ...state, turn: "green" }).turn, "red");
}

{
  const state = initialGameState(13, "yellow", 4, false, 0, [], "team");
  assert.equal(state.size, 13, "チーム戦では13×13を使用できる");
  assert.equal(state.turn, "yellow", "4色すべてを先攻に選択できる");
  assert.deepEqual(state.probes.yellow, { r: 6, c: 11 });
}

{
  const state = initialGameState(11, "red", 4, true);
  assert.equal(state.obstaclesEnabled, false);
  assert.deepEqual(state.obstacles, []);
  assert.equal(state.obstacleAvailable.red, 0);
  state.phase = "place";
  state.playerTurns.red = 2;
  assert.throws(() => applyObstacle(state, { r: 3, c: 3 }), /配置できません/);
  const passed = applyPass(state);
  assert.equal(passed.passAvailable.red, false);
  assert.throws(() => applyPass({ ...passed, turn: "red", phase: "place" }), /使用できません/);
}

console.log("game-rules: all checks passed");

{
  const team = initialGameState(9, "red", 2, false, 0, [], "team");
  assert.equal(team.size, 13);
  assert.deepEqual(team.players, ["red", "blue", "yellow", "green"]);
  assert.equal(finishTurn(team).turn, "blue");
  const win = {
    ...team,
    turnCount: 2,
    probes: { ...team.probes, red: { r: 7, c: 6 } },
  };
  const resolved = applyMove(win, { r: 6, c: 6 });
  assert.equal(resolved.winner, "red");
  assert.match(resolved.message, /TEAM WIN/);
}

{
  const item = initialGameState(15, "red", 2, false, 0, [], "item");
  assert.equal(item.size, 15);
  assert.equal(item.phase, "setup", "アイテム戦はARSENAL選択から始まる");
}

{
  const combined = initialGameState(13, "red", 2, false, 0, [], "team-item");
  assert.equal(combined.size, 13, "team-item supports the 13x13 item board");
  assert.deepEqual(combined.players, ["red", "blue", "yellow", "green"]);
  assert.equal(combined.phase, "setup", "all four players choose items before play");

  combined.phase = "switch";
  combined.pendingSwitches = [{ kind: "holo", player: "red" }];
  combined.switchResume = "finish";
  const withObstacle = applyHoloSwitch(combined, { r: 5, c: 5 });
  assert.equal(withObstacle.obstacles.length, 1);
  assert.ok((withObstacle.obstacles[0].turns ?? 0) > 0, "obstacle retains countdown data");

  const winning = initialGameState(15, "red", 4, false, 0, [], "team-item");
  winning.phase = "move";
  winning.turnCount = 2;
  winning.probes.red = { r: 8, c: 7 };
  const result = applyMove(winning, { r: 7, c: 7 });
  assert.equal(result.winner, "red");
  assert.match(result.message, /TEAM WIN/);
}

for (const boardSize of [11, 13, 15]) {
  const item = initialGameState(boardSize, "red", 2, false, 0, [], "item");
  assert.equal(item.size, boardSize, `item battle supports ${boardSize}x${boardSize}`);
  assert.equal(item.phase, "setup");
}

{
  const item = initialGameState(15, "red", 2, false, 0, [], "item");
  item.turnCount = 2;
  item.phase = "place";
  item.capsuleMeteors.red = 1;
  const placed = applyMeteor(item, { r: 10, c: 10 }, "small", true).state;
  assert.equal(placed.capsuleMeteors.red, 0);
  const capsule = placed.meteors.find((meteor) => meteor.consumable);
  assert.ok(capsule);
  const enemyBlast = {
    ...placed,
    turn: "blue" as Player,
    phase: "place" as const,
  };
  const destroyed = applyMeteor(enemyBlast, { r: 9, c: 9 }, "small").state;
  assert.equal(destroyed.inventory.red.small, placed.inventory.red.small);
}

{
  const item = initialGameState(15, "red", 2, false, 0, [], "item");
  item.turnCount = 2;
  item.phase = "place";
  item.probes.red = { r: 8, c: 6 };
  item.boosterMoves.red = 2;
  const blast = applyMeteor(item, { r: 9, c: 6 }, "small").state;
  assert.deepEqual(
    blast.probes.red,
    { r: 7, c: 6 },
    "BOOSTER中も爆風で押される距離は通常どおり",
  );
}

{
  let ranked = initialGameState(11, "red", 3, false, 0, [], "classic");
  ranked.turnCount = 2;
  ranked.phase = "move";
  ranked.probes.red = { r: 6, c: 5 };
  ranked = applyMove(ranked, { r: 5, c: 5 });
  assert.equal(ranked.phase, "move", "3人戦は最初のゴールで終了しない");
  assert.deepEqual(ranked.finishOrder, ["red"]);
  assert.ok(!ranked.players.includes("red"), "ゴール済みプレイヤーは以後の手番から外れる");

  const second = ranked.turn;
  ranked.probes[second] = { r: 6, c: 5 };
  ranked = applyMove(ranked, { r: 5, c: 5 });
  assert.equal(ranked.phase, "over", "残り1人になった時点で全順位が確定する");
  assert.deepEqual(ranked.finishOrder, ["red", second, ranked.players[0]]);
  assert.equal(ranked.winner, "red");
}
