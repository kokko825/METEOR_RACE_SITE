import assert from "node:assert/strict";
import { chooseAiDecision } from "../app/ai-engine";
import { applyHoloSwitch, applyMeteor, applyMove, applyOrbitSwitch, applyPass, applyPulseSwitch, applyRecallItem, applySetupItem, applyUseItem, finishTurn, initialGameState, legalMoves, type GameState } from "../app/game-rules";

const itemUses: Record<string, number> = {};
function step(state: GameState): GameState {
  const d = chooseAiDecision(state, "hard", () => 0.73);
  if (d.type === "setup") return applySetupItem(state, d.kind);
  if (d.type === "move") return applyMove(state, d.target);
  if (d.type === "meteor") return applyMeteor(state, d.target, d.size, d.useCapsule).state;
  if (d.type === "item") { itemUses[d.kind] = (itemUses[d.kind] ?? 0) + 1; return applyUseItem(state, d.kind); }
  if (d.type === "pass") return applyPass(state);
  if (d.type === "holo") return applyHoloSwitch(state, d.target);
  if (d.type === "pulse") return applyPulseSwitch(state, d.target);
  if (d.type === "orbit") return applyOrbitSwitch(state, d.ring, d.clockwise);
  if (d.type === "recall") return applyRecallItem(state, d.meteorId);
  if (state.phase === "move" && legalMoves(state).length === 0) return { ...state, phase: "place" };
  return finishTurn(state);
}

const wins = { red: 0, blue: 0, green: 0, yellow: 0, draw: 0 };
let totalTurns = 0;
const games = 20;
for (let gameIndex = 0; gameIndex < games; gameIndex += 1) {
  let state = initialGameState(15, ["red", "blue", "green", "yellow"][gameIndex % 4] as GameState["turn"], 4, false, gameIndex % 4, ["red", "blue", "green", "yellow"], "item");
  let actions = 0;
  while (state.phase !== "over" && actions < 600) { state = step(state); actions += 1; }
  assert.equal(state.phase, "over", `game ${gameIndex + 1} must finish`);
  assert.ok(!state.pendingSwitches?.length, `game ${gameIndex + 1} must resolve every switch`);
  wins[state.winner ?? "draw"] += 1;
  totalTurns += state.turnCount;
}
console.log(JSON.stringify({ mode: "item", difficulty: "hard", games, wins, averageTurns: Number((totalTurns / games).toFixed(1)), itemUses }));
