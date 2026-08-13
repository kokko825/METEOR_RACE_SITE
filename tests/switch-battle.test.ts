import assert from "node:assert/strict";
import {
  applyMeteor,
  applyBlastSwitch,
  applyHoloSwitch,
  applyOrbitSwitch,
  applyPulseSwitch,
  applyRecallItem,
  applySetupItem,
  applyUseItem,
  confirmSetupItems,
  finishTurn,
  resetSetupItems,
  initialGameState,
  legalMoves,
  samePos,
  type GameState,
  type ItemKind,
} from "../app/game-rules";

const select = (state: GameState, kinds: ItemKind[]) =>
  kinds.reduce((current, kind) => applySetupItem(current, kind), state);

let setup = initialGameState(15, "red", 2, false, 0, [], "item");
setup = select(setup, ["shield", "shield", "pulse"]);
assert.deepEqual(setup.itemHands?.red, ["shield", "shield", "pulse"]);
assert.equal(setup.turn, "red");
setup = resetSetupItems(setup);
assert.deepEqual(setup.itemHands?.red, []);
setup = select(setup, ["shield", "shield", "pulse"]);
setup = confirmSetupItems(setup);
assert.equal(setup.turn, "blue");
assert.throws(() => applySetupItem({ ...setup, turn: "blue", itemHands: { ...setup.itemHands, blue: ["pulse", "pulse"] } }, "pulse"));

{
  let simultaneous = initialGameState(13, "red", 2, false, 0, [], "item");
  simultaneous = applySetupItem(simultaneous, "shield", "red");
  simultaneous = applySetupItem(simultaneous, "booster", "blue");
  assert.deepEqual(simultaneous.itemHands?.red, ["shield"]);
  assert.deepEqual(simultaneous.itemHands?.blue, ["booster"]);
  assert.equal(simultaneous.turn, "red", "simultaneous loadout editing does not steal the shared turn");
}
setup = select(setup, ["booster", "recall", "orbit"]);
setup = confirmSetupItems(setup);
assert.equal(setup.phase, "move");

let shieldGame = initialGameState(15, "red", 2, false, 0, [], "item");
shieldGame = {
  ...shieldGame,
  phase: "place",
  turnCount: 2,
  probes: { ...shieldGame.probes, red: { r: 7, c: 6 }, blue: { r: 2, c: 7 } },
  itemHands: { red: ["shield"], blue: [] },
};
shieldGame = applyUseItem(shieldGame, "shield");
assert.equal(shieldGame.turn, "blue");
assert.equal(shieldGame.shieldTurns?.red, 1, "shield lasts through every opponent in one round");
const shielded = applyMeteor({ ...shieldGame, phase: "place" }, { r: 7, c: 5 }, "small").state;
assert.ok(samePos(shielded.probes.red, { r: 7, c: 6 }), "shield cancels one square of blast movement");

let blastGame = initialGameState(15, "red", 2, false, 0, [], "item");
blastGame = {
  ...blastGame,
  phase: "place",
  turnCount: 2,
  probes: { ...blastGame.probes, red: { r: 10, c: 7 }, blue: { r: 6, c: 7 } },
  meteors: [{ r: 5, c: 6, owner: "blue", size: "small", id: 10 }],
  itemHands: { red: ["blast"], blue: [] },
};
blastGame = applyUseItem(blastGame, "blast");
blastGame = applyBlastSwitch(blastGame, { r: 7, c: 7 });
assert.ok(samePos(blastGame.probes.blue, { r: 5, c: 7 }), "BLAST pushes a probe by one square");
assert.equal(blastGame.meteors.length, 1, "BLAST never destroys or recovers meteors");
assert.equal(blastGame.immobilizedMoves?.blue, 0, "BLAST does not apply PULSE immobilization");
assert.equal(blastGame.pulseDevices?.length, 0, "BLAST does not leave a PULSE generator");

let deviceGame = initialGameState(15, "red", 2, false, 0, [], "item");
deviceGame = {
  ...deviceGame,
  phase: "switch",
  probes: { ...deviceGame.probes, red: { r: 10, c: 7 }, blue: { r: 7, c: 9 } },
  pendingSwitches: [{ kind: "pulse", player: "red" }],
  switchResume: "finish",
};
deviceGame = applyPulseSwitch(deviceGame, { r: 7, c: 8 });
assert.ok(samePos(deviceGame.pulseDevices?.[0] ?? { r: -1, c: -1 }, { r: 7, c: 8 }), "PULSE leaves its fired EMP generator on the board");
assert.deepEqual(legalMoves({ ...deviceGame, phase: "move", turn: "blue" }, "blue"), [], "PULSE field prevents voluntary movement while inside its range");
assert.ok(samePos(deviceGame.probes.blue, { r: 7, c: 9 }), "PULSE does not apply BLAST knockback");
assert.equal(deviceGame.pulseDevices?.[0]?.turns, 2, "PULSE remains deployed for two turns after activation");
deviceGame = {
  ...deviceGame,
  phase: "switch",
  pendingSwitches: [{ kind: "orbit", player: deviceGame.turn }],
  switchResume: "finish",
};
deviceGame = applyOrbitSwitch(deviceGame, 1, true);
assert.ok(samePos(deviceGame.pulseDevices?.[0] ?? { r: -1, c: -1 }, { r: 8, c: 7 }), "ORBIT rotates a fired EMP generator with its ring");
assert.equal(deviceGame.pulseDevices?.length, 1, "ORBIT does not reactivate or consume an EMP generator");
assert.ok(legalMoves({ ...deviceGame, phase: "move", turn: "blue" }, "blue").length > 0, "moving PULSE away with ORBIT immediately unlocks a probe outside the field");
deviceGame = finishTurn(deviceGame);
assert.equal(deviceGame.pulseDevices?.length, 0, "PULSE generator disappears after its two active turns");

let boosterJump = initialGameState(15, "red", 2, false, 0, [], "item");
boosterJump = {
  ...boosterJump,
  phase: "move",
  probes: { ...boosterJump.probes, red: { r: 10, c: 7 }, blue: { r: 2, c: 2 } },
  meteors: [{ r: 9, c: 7, owner: "blue", size: "small", id: 81 }],
  boosterMoves: { ...boosterJump.boosterMoves, red: 1 },
};
assert.ok(legalMoves(boosterJump).some((move) => samePos(move, { r: 8, c: 7 })), "BOOSTER can jump over a meteor to an empty landing cell");

let pulseHolo = initialGameState(15, "red", 2, false, 0, [], "item");
pulseHolo = {
  ...pulseHolo,
  phase: "switch",
  probes: { ...pulseHolo.probes, red: { r: 10, c: 7 }, blue: { r: 2, c: 2 } },
  obstacles: [{ r: 7, c: 8, owner: "blue", id: 90, turns: 4 }],
  pendingSwitches: [{ kind: "blast", player: "red" }],
  balance: { ...pulseHolo.balance!, blastRadius: 2, holoUnlimited: 0 },
};
pulseHolo = applyBlastSwitch(pulseHolo, { r: 7, c: 7 });
assert.equal(pulseHolo.obstacles.length, 0, "BLAST inner damage removes a holo meteor with two displayed rounds left");

let coreStop = initialGameState(15, "red", 2, false, 0, [], "item");
coreStop = {
  ...coreStop,
  phase: "switch",
  probes: { ...coreStop.probes, red: { r: 10, c: 7 }, blue: { r: 2, c: 2 } },
  obstacles: [{ r: 7, c: 6, owner: "blue", id: 91, turns: 6 }],
  pendingSwitches: [{ kind: "blast", player: "red" }],
  balance: { ...coreStop.balance!, blastRadius: 2 },
};
coreStop = applyBlastSwitch(coreStop, { r: 7, c: 5 });
assert.ok(samePos(coreStop.obstacles[0], { r: 7, c: 6 }), "BLAST never moves a holo meteor toward CORE");
assert.equal(coreStop.obstacles[0].turns, 1, "BLAST damage is measured in displayed rounds");

let meteorHolo = initialGameState(15, "red", 2, false, 0, [], "item");
meteorHolo = {
  ...meteorHolo,
  phase: "place",
  turnCount: 2,
  probes: { ...meteorHolo.probes, red: { r: 11, c: 7 }, blue: { r: 2, c: 2 } },
  obstacles: [{ r: 7, c: 8, owner: "blue", id: 93, turns: 4 }],
};
meteorHolo = applyMeteor(meteorHolo, { r: 7, c: 9 }, "large").state;
assert.equal(meteorHolo.obstacles.length, 0, "large meteor inner blast removes a holo meteor with two displayed rounds left");

let recallGame = initialGameState(15, "red", 2, false, 0, [], "item");
recallGame = {
  ...recallGame,
  phase: "place",
  turnCount: 2,
  inventory: { ...recallGame.inventory, red: { small: 1, large: 1 } },
  meteors: [
    { r: 9, c: 7, owner: "red", size: "small", id: 20 },
    { r: 8, c: 7, owner: "red", size: "large", id: 21 },
    { r: 5, c: 7, owner: "blue", size: "small", id: 22 },
  ],
  obstacles: [
    { r: 6, c: 7, owner: "red", id: 92, turns: -1 },
    { r: 6, c: 8, owner: "blue", id: 93, turns: 4 },
  ],
  itemHands: { red: ["recall"], blue: [] },
};
recallGame = applyUseItem(recallGame, "recall");
assert.equal(recallGame.meteors.length, 1, "RECALL leaves opponent meteors on the board");
assert.equal(recallGame.inventory.red.small, 2, "RECALL returns every own small meteor");
assert.equal(recallGame.inventory.red.large, 2, "RECALL returns every own large meteor");
assert.equal(recallGame.obstacles.length, 1, "RECALL removes every own holo and leaves opponent holos");

let durationAudit = initialGameState(15, "red", 4, false, 0, [], "item");
durationAudit = {
  ...durationAudit,
  phase: "place",
  turnCount: 2,
  itemHands: { red: ["shield"], blue: [], yellow: [], green: [] },
};
durationAudit = applyUseItem(durationAudit, "shield");
assert.equal(durationAudit.shieldTurns?.red, 3, "one SHIELD round covers the other three players in a four-player match");
durationAudit = finishTurn(finishTurn(finishTurn(durationAudit)));
assert.equal(durationAudit.shield.red, false, "SHIELD expires when the owner receives the next turn, independent of seat order");

let pulseDuration = initialGameState(15, "red", 4, false, 0, [], "item");
pulseDuration = {
  ...pulseDuration,
  phase: "switch",
  turnCount: 4,
  probes: { ...pulseDuration.probes, red: { r: 10, c: 7 }, blue: { r: 6, c: 7 } },
  pendingSwitches: [{ kind: "pulse", player: "red" }],
  switchResume: "finish",
};
pulseDuration = applyPulseSwitch(pulseDuration, { r: 7, c: 8 });
assert.equal(pulseDuration.pulseDevices?.[0]?.turns, 2, "PULSE starts at two turns immediately when placed");
pulseDuration = finishTurn(pulseDuration);
assert.equal(pulseDuration.pulseDevices?.[0]?.turns, 1, "PULSE consumes one count per completed turn, not per player round");
pulseDuration = finishTurn(pulseDuration);
assert.equal(pulseDuration.pulseDevices?.length, 0, "PULSE expires after exactly two subsequent turns in four-player play too");

let holoDuration = initialGameState(15, "red", 4, false, 0, [], "item");
holoDuration = { ...holoDuration, phase: "switch", turnCount: 4, pendingSwitches: [{ kind: "holo", player: "red" }] };
holoDuration = applyHoloSwitch(holoDuration, { r: 6, c: 6 });
assert.equal(Math.ceil((holoDuration.obstacles[0].turns ?? 0) / 4), 2, "HOLO remains round-based and starts at two displayed rounds");

console.log("item-battle: all checks passed");
