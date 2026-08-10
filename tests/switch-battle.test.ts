import assert from "node:assert/strict";
import {
  activeObstacles, applyHoloSwitch, applyMove, applyOrbitSwitch, applyPulseSwitch,
  finishTurn, initialGameState, samePos,
} from "../app/game-rules";

let game = initialGameState(15, "red", 4, false, 0, [], "item");
game.turnCount = 2;
game.probes.red = { r: 12, c: 7 };
game.fieldItems = [{ r: 11, c: 7, kind: "holo", id: 1 }];
game = applyMove(game, { r: 11, c: 7 });
assert.equal(game.phase, "switch");
game = applyHoloSwitch(game, { r: 8, c: 7 });
assert.equal(activeObstacles(game).length, 1);
for (let i = 0; i < 7; i += 1) game = finishTurn(game);
assert.equal(activeObstacles(game).length, 1);
game = finishTurn(game);
assert.equal(activeObstacles(game).length, 0, "HOLO lasts exactly two four-player rounds");

game = initialGameState(15, "red", 4, false, 0, [], "item");
game.turnCount = 2;
game.probes.red = { r: 12, c: 7 };
game.fieldItems = [{ r: 11, c: 7, kind: "orbit", id: 1 }];
game.meteors = [{ r: 1, c: 7, owner: "blue", size: "small", id: 9 }];
game = applyMove(game, { r: 11, c: 7 });
game = applyOrbitSwitch(game, 6, true);
assert.ok(samePos(game.meteors[0], { r: 7, c: 13 }), "ORBIT rotates ring objects 90 degrees");

game = initialGameState(15, "red", 2, false, 0, [], "item");
game.turnCount = 2;
game.probes.red = { r: 12, c: 7 };
game.probes.blue = { r: 6, c: 7 };
game.fieldItems = [{ r: 11, c: 7, kind: "pulse", id: 1 }];
game = applyMove(game, { r: 11, c: 7 });
game = applyPulseSwitch(game, { r: 7, c: 7 });
assert.ok(samePos(game.probes.blue, { r: 5, c: 7 }), "PULSE applies a small blast without leaving a meteor");

console.log("switch-battle: all checks passed");
