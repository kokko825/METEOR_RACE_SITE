import assert from "node:assert/strict";
import { initialGameState, type GameState } from "../app/game-rules.js";
import { detectStrongPlay, strongPlaySnapshot } from "../app/strong-play.js";

const base = initialGameState(9, "red", 2, false, 0, ["blue"], "classic");
base.turnCount = 4;
base.phase = "place";
base.probes.blue = { r: 2, c: 4 };

const ordinary = structuredClone(base);
ordinary.probes.red = { r: 7, c: 4 };
assert.equal(detectStrongPlay(base, ordinary), null, "ordinary one-cell progress is not stored");

const combined = structuredClone(base);
combined.probes.red = { r: 7, c: 4 };
combined.probes.blue = { r: 1, c: 4 };
const combinedPlay = detectStrongPlay(base, combined);
assert.equal(combinedPlay?.category, "advance_pressure");
assert.ok(combinedPlay && combinedPlay.score >= 38);

const gate = structuredClone(base);
gate.meteors.push({ id: 99, owner: "red", size: "small", r: 4, c: 6 });
const gatePlay = detectStrongPlay(base, gate);
assert.equal(gatePlay?.category, "future_gate");

const snapshot = strongPlaySnapshot(base) as ReturnType<typeof strongPlaySnapshot> & Record<string, unknown>;
assert.equal("log" in snapshot, false);
assert.equal("message" in snapshot, false);
assert.equal("balance" in snapshot, false);
assert.equal("roomMemberNames" in snapshot, false);

const finished = structuredClone(base) as GameState;
finished.phase = "over";
finished.winner = "red";
const finishPlay = detectStrongPlay(base, finished);
assert.equal(finishPlay?.category, "finish");

console.log("strong-play: all checks passed");
