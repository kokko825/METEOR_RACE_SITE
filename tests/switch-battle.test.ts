import assert from "node:assert/strict";
import {
  applyMeteor,
  applyPulseSwitch,
  applyRecallItem,
  applySetupItem,
  applyUseItem,
  confirmSetupItems,
  resetSetupItems,
  initialGameState,
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

let pulseGame = initialGameState(15, "red", 2, false, 0, [], "item");
pulseGame = {
  ...pulseGame,
  phase: "place",
  turnCount: 2,
  probes: { ...pulseGame.probes, red: { r: 10, c: 7 }, blue: { r: 6, c: 7 } },
  meteors: [{ r: 5, c: 6, owner: "blue", size: "small", id: 10 }],
  itemHands: { red: ["pulse"], blue: [] },
};
pulseGame = applyUseItem(pulseGame, "pulse");
pulseGame = applyPulseSwitch(pulseGame, { r: 7, c: 7 });
assert.ok(samePos(pulseGame.probes.blue, { r: 5, c: 7 }), "PULSE pushes a probe by one square");
assert.equal(pulseGame.meteors.length, 1, "PULSE never destroys or recovers meteors");

let pulseHolo = initialGameState(15, "red", 2, false, 0, [], "item");
pulseHolo = {
  ...pulseHolo,
  phase: "switch",
  probes: { ...pulseHolo.probes, red: { r: 10, c: 7 }, blue: { r: 2, c: 2 } },
  obstacles: [{ r: 7, c: 8, owner: "blue", id: 90, turns: -1 }],
  pendingSwitches: [{ kind: "pulse", player: "red" }],
  balance: { ...pulseHolo.balance!, pulseRadius: 2, holoUnlimited: 1 },
};
pulseHolo = applyPulseSwitch(pulseHolo, { r: 7, c: 7 });
assert.ok(samePos(pulseHolo.obstacles[0], { r: 7, c: 10 }), "PULSE is strongest near its center and pushes a nearby holo meteor two squares");
assert.equal(pulseHolo.obstacles[0].turns, -1, "unlimited holo meteor does not expire");

let coreStop = initialGameState(15, "red", 2, false, 0, [], "item");
coreStop = {
  ...coreStop,
  phase: "switch",
  probes: { ...coreStop.probes, red: { r: 10, c: 7 }, blue: { r: 2, c: 2 } },
  obstacles: [{ r: 7, c: 6, owner: "blue", id: 91, turns: 4 }],
  pendingSwitches: [{ kind: "pulse", player: "red" }],
  balance: { ...coreStop.balance!, pulseRadius: 2 },
};
coreStop = applyPulseSwitch(coreStop, { r: 7, c: 5 });
assert.ok(samePos(coreStop.obstacles[0], { r: 7, c: 6 }), "PULSE stops a holo meteor before CORE");

let recallGame = initialGameState(15, "red", 2, false, 0, [], "item");
recallGame = {
  ...recallGame,
  phase: "place",
  turnCount: 2,
  inventory: { ...recallGame.inventory, red: { small: 1, large: 1 } },
  meteors: [{ r: 9, c: 7, owner: "red", size: "small", id: 20 }],
  itemHands: { red: ["recall"], blue: [] },
};
recallGame = applyUseItem(recallGame, "recall");
recallGame = applyRecallItem(recallGame, 20);
assert.equal(recallGame.meteors.length, 0);
assert.equal(recallGame.inventory.red.small, 2, "RECALL returns only the selected own meteor");

let recallHolo = initialGameState(15, "red", 2, false, 0, [], "item");
recallHolo = {
  ...recallHolo,
  phase: "switch",
  obstacles: [{ r: 6, c: 7, owner: "red", id: 92, turns: -1 }],
  pendingSwitches: [{ kind: "recall", player: "red" }],
  itemHands: { red: [], blue: [] },
};
recallHolo = applyRecallItem(recallHolo, 92);
assert.equal(recallHolo.obstacles.length, 0, "RECALL removes the selected own holo meteor");
assert.deepEqual(recallHolo.itemHands?.red, ["holo"], "RECALL returns the holo meteor to the item hand");

console.log("item-battle: all checks passed");
