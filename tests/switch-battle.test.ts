import assert from "node:assert/strict";
import {
  applyMeteor,
  applyMove,
  applyBlastSwitch,
  applyHoloSwitch,
  applyGravity,
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
  distance,
  type GameState,
  type ItemKind,
} from "../app/game-rules";
import { DEFAULT_BALANCE } from "../app/balance-config";

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
  inventory: { ...shieldGame.inventory, blue: { small: 5, large: 2 } },
};
shieldGame = applyUseItem(shieldGame, "shield");
assert.equal(shieldGame.turn, "blue");
assert.equal(shieldGame.shieldCharges?.red, 2, "SHIELD starts with two absorbable hits");
const shielded = applyMeteor({ ...shieldGame, phase: "place" }, { r: 7, c: 5 }, "small").state;
assert.ok(samePos(shielded.probes.red, { r: 7, c: 6 }), "shield cancels one square of blast movement");
assert.equal(shielded.shieldCharges?.red, 1, "a normal hit consumes one shield charge");
assert.equal(shielded.shield.red, true, "shield survives after absorbing one normal hit");
const shieldedAgain = applyMeteor({ ...shielded, phase: "place", turn: "blue" }, { r: 6, c: 6 }, "small").state;
assert.ok(samePos(shieldedAgain.probes.red, { r: 7, c: 6 }), "the remaining charge blocks a second normal hit");
assert.equal(shieldedAgain.shieldCharges?.red, 0, "a second normal hit exhausts SHIELD");
assert.equal(shieldedAgain.shield.red, false, "SHIELD is gone after two normal hits");
const unshieldedHit = applyMeteor({ ...shieldedAgain, phase: "place", turn: "blue" }, { r: 8, c: 7 }, "small").state;
assert.ok(!samePos(unshieldedHit.probes.red, { r: 7, c: 6 }), "a third hit pushes red once SHIELD is exhausted");

let bigHitShield = initialGameState(15, "red", 2, false, 0, [], "item");
bigHitShield = {
  ...bigHitShield,
  phase: "place",
  turnCount: 2,
  probes: { ...bigHitShield.probes, red: { r: 7, c: 6 }, blue: { r: 2, c: 7 } },
  itemHands: { red: ["shield"], blue: [] },
};
bigHitShield = applyUseItem(bigHitShield, "shield");
assert.equal(bigHitShield.shieldCharges?.red, 2);
const afterBigHit = applyMeteor({ ...bigHitShield, phase: "place" }, { r: 7, c: 5 }, "large").state;
assert.ok(samePos(afterBigHit.probes.red, { r: 7, c: 6 }), "SHIELD fully blocks a close-range large-meteor blast");
assert.equal(afterBigHit.shieldCharges?.red, 0, "a close-range large-meteor hit consumes both charges at once");
assert.equal(afterBigHit.shield.red, false, "SHIELD breaks immediately from a close-range large-meteor hit");

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
assert.equal(deviceGame.pulseDevices?.[0]?.turns, 4, "PULSE remains deployed for two rounds after activation");
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
deviceGame = finishTurn(finishTurn(finishTurn(finishTurn(deviceGame))));
assert.equal(deviceGame.pulseDevices?.length, 0, "PULSE generator disappears after its two active rounds");

let boosterJump = initialGameState(15, "red", 2, false, 0, [], "item");
boosterJump = {
  ...boosterJump,
  phase: "move",
  probes: { ...boosterJump.probes, red: { r: 10, c: 7 }, blue: { r: 2, c: 2 } },
  meteors: [{ r: 9, c: 7, owner: "blue", size: "small", id: 81 }],
  boosterMoves: { ...boosterJump.boosterMoves, red: 1 },
};
assert.ok(legalMoves(boosterJump).some((move) => samePos(move, { r: 8, c: 7 })), "BOOSTER can jump over a meteor to an empty landing cell");

let boosterCore = initialGameState(15, "red", 2, false, 0, [], "item");
boosterCore = {
  ...boosterCore,
  phase: "move",
  probes: { ...boosterCore.probes, red: { r: 9, c: 7 }, blue: { r: 2, c: 2 } },
  boosterMoves: { ...boosterCore.boosterMoves, red: 1 },
};
const boosterCoreMoves = legalMoves(boosterCore);
assert.ok(boosterCoreMoves.some((move) => samePos(move, { r: 7, c: 7 })), "BOOSTER can enter CORE on its second movement step");
assert.ok(!boosterCoreMoves.some((move) => samePos(move, { r: 6, c: 7 })), "BOOSTER movement stops at CORE");
boosterCore = applyMove(boosterCore, { r: 7, c: 7 });
assert.equal(boosterCore.winner, "red", "entering CORE with BOOSTER wins the game");

let boosterExpiry = initialGameState(15, "red", 2, false, 0, [], "item");
boosterExpiry = {
  ...boosterExpiry,
  phase: "move",
  turnCount: 2,
  probes: { ...boosterExpiry.probes, red: { r: 10, c: 7 }, blue: { r: 2, c: 2 } },
  boosterMoves: { ...boosterExpiry.boosterMoves, red: 1 },
};
boosterExpiry = applyMove(boosterExpiry, { r: 9, c: 7 });
assert.equal(boosterExpiry.boosterMoves.red, 0, "BOOSTER is spent by the very next move, even a single-square one");
assert.ok(!legalMoves(boosterExpiry).some((move) => distance(boosterExpiry.probes.red, move) > 1), "BOOSTER no longer grants extended range after it has been spent");

let gravityGame = initialGameState(15, "red", 4, false, 0, [], "item");
gravityGame = {
  ...gravityGame,
  probes: {
    red: { r: 11, c: 7 }, blue: { r: 3, c: 7 },
    green: { r: 7, c: 3 }, yellow: { r: 7, c: 11 },
  },
};
gravityGame = applyGravity(gravityGame);
assert.deepEqual(gravityGame.probes.red, { r: 10, c: 7 }, "GRAVITY pulls red one cell inward");
assert.deepEqual(gravityGame.probes.blue, { r: 4, c: 7 }, "GRAVITY pulls blue one cell inward");
assert.deepEqual(gravityGame.probes.green, { r: 7, c: 4 }, "GRAVITY pulls green one cell inward");
assert.deepEqual(gravityGame.probes.yellow, { r: 7, c: 10 }, "GRAVITY pulls yellow one cell inward");
gravityGame = {
  ...gravityGame,
  probes: { ...gravityGame.probes, red: { r: 10, c: 7 } },
  meteors: [{ r: 9, c: 7, owner: "blue", size: "small", id: 82 }],
};
gravityGame = applyGravity(gravityGame);
assert.deepEqual(gravityGame.probes.red, { r: 10, c: 7 }, "GRAVITY cannot pull through a meteor");

assert.throws(
  () => applySetupItem(initialGameState(15, "red", 2, false, 0, [], "item"), "gravity"),
  /reserved for ranked/,
  "GRAVITY is no longer a selectable item",
);
let rankedGravity = initialGameState(15, "red", 2, false, 0, [], "classic", undefined, true);
rankedGravity = {
  ...rankedGravity,
  probes: { ...rankedGravity.probes, red: { r: 9, c: 7 }, blue: { r: 7, c: 3 } },
  meteors: [{ r: 8, c: 7, owner: "blue", size: "small", id: 501 }],
};
for (let turn = 0; turn < 8; turn += 1) rankedGravity = finishTurn(rankedGravity);
assert.equal(rankedGravity.rankedGravityRoundsRemaining, 1, "ranked match warns one round before gravity");
for (let turn = 0; turn < 2; turn += 1) rankedGravity = finishTurn(rankedGravity);
assert.equal(rankedGravity.rankedGravityPulse, 1, "ranked gravity fires every five complete rounds");
assert.equal(rankedGravity.rankedGravityRoundsRemaining, 5, "ranked gravity countdown resets after activation");
assert.deepEqual(rankedGravity.probes.red, { r: 8, c: 7 });
assert.deepEqual(rankedGravity.probes.blue, { r: 7, c: 4 });
assert.ok(!rankedGravity.meteors.some((meteor) => meteor.id === 501), "orbital gravity clears a blocking normal meteor");

let fastRankedGravity = initialGameState(
  9,
  "red",
  2,
  false,
  0,
  [],
  "classic",
  { ...DEFAULT_BALANCE, rankedGravityRounds: 3 },
  true,
);
assert.equal(fastRankedGravity.rankedGravityRoundsRemaining, 3, "configured gravity cycle is stored in the match");
for (let turn = 0; turn < 6; turn += 1) fastRankedGravity = finishTurn(fastRankedGravity);
assert.equal(fastRankedGravity.rankedGravityPulse, 1, "configured three-round gravity cycle activates");
assert.equal(fastRankedGravity.rankedGravityRoundsRemaining, 3, "configured gravity cycle resets to its configured value");

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
assert.equal(durationAudit.shieldCharges?.red, 2, "SHIELD starts with two absorbable hits regardless of player count");
durationAudit = finishTurn(finishTurn(finishTurn(durationAudit)));
assert.equal(durationAudit.shield.red, true, "SHIELD no longer expires from the passage of turns alone");
assert.equal(durationAudit.shieldCharges?.red, 2, "SHIELD charges are untouched while nothing hits the owner");

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
assert.equal(pulseDuration.pulseDevices?.[0]?.turns, 8, "PULSE starts at two rounds immediately when placed in four-player play");
pulseDuration = finishTurn(pulseDuration);
assert.equal(pulseDuration.pulseDevices?.[0]?.turns, 7, "PULSE consumes one internal count per completed player turn");
for (let turn = 0; turn < 7; turn += 1) pulseDuration = finishTurn(pulseDuration);
assert.equal(pulseDuration.pulseDevices?.length, 0, "PULSE expires after exactly two full rounds in four-player play");

let holoDuration = initialGameState(15, "red", 4, false, 0, [], "item");
holoDuration = { ...holoDuration, phase: "switch", turnCount: 4, pendingSwitches: [{ kind: "holo", player: "red" }] };
holoDuration = applyHoloSwitch(holoDuration, { r: 6, c: 6 });
assert.equal(Math.ceil((holoDuration.obstacles[0].turns ?? 0) / 4), 2, "HOLO remains round-based and starts at two displayed rounds");

console.log("item-battle: all checks passed");
