import assert from "node:assert/strict";
import { chooseAiDecision } from "../app/ai-engine";
import { applyHoloSwitch, applyMeteor, applyMove, applyOrbitSwitch, applyPass, applyPulseSwitch, applyRecallItem, applySetupItem, applyUseItem, finishTurn, initialGameState, legalMoves, type GameState } from "../app/game-rules";

const itemUses: Record<string, number> = {};
const itemUsesByPlayer: Record<string, Record<string, number>> = {};
const setupChoices: Record<string, Record<string, number>> = {};
function step(state: GameState, random: () => number): GameState {
  const d = chooseAiDecision(state, "hard", random);
  if (d.type === "setup") {
    setupChoices[state.turn] ??= {};
    setupChoices[state.turn][d.kind] = (setupChoices[state.turn][d.kind] ?? 0) + 1;
    return applySetupItem(state, d.kind);
  }
  if (d.type === "move") return applyMove(state, d.target);
  if (d.type === "meteor") return applyMeteor(state, d.target, d.size, d.useCapsule).state;
  if (d.type === "item") {
    itemUses[d.kind] = (itemUses[d.kind] ?? 0) + 1;
    itemUsesByPlayer[state.turn] ??= {};
    itemUsesByPlayer[state.turn][d.kind] = (itemUsesByPlayer[state.turn][d.kind] ?? 0) + 1;
    return applyUseItem(state, d.kind);
  }
  if (d.type === "pass") return applyPass(state);
  if (d.type === "holo") return applyHoloSwitch(state, d.target);
  if (d.type === "pulse") return applyPulseSwitch(state, d.target);
  if (d.type === "orbit") return applyOrbitSwitch(state, d.ring, d.clockwise);
  if (d.type === "recall") return applyRecallItem(state, d.meteorId);
  if (state.phase === "move" && legalMoves(state).length === 0) return { ...state, phase: "place" };
  return finishTurn(state);
}

const wins = { red: 0, blue: 0, green: 0, yellow: 0, draw: 0 };
const winsByFirst = { red: 0, blue: 0, green: 0, yellow: 0 };
let totalTurns = 0;
const games = Number(process.env.SIM_GAMES ?? 20);
const offset = Number(process.env.SIM_OFFSET ?? 0);
for (let gameIndex = 0; gameIndex < games; gameIndex += 1) {
  const gameNumber = offset + gameIndex;
  let seed = (gameNumber + 1) * 0x9e3779b1;
  const random = () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  let state = initialGameState(15, ["red", "blue", "green", "yellow"][gameNumber % 4] as GameState["turn"], 4, false, gameNumber % 4, ["red", "blue", "green", "yellow"], "item");
  let actions = 0;
  while (state.phase !== "over" && actions < 600) { state = step(state, random); actions += 1; }
  assert.equal(state.phase, "over", `game ${gameIndex + 1} must finish`);
  assert.ok(!state.pendingSwitches?.length, `game ${gameIndex + 1} must resolve every switch`);
  wins[state.winner ?? "draw"] += 1;
  if (state.winner !== "draw") winsByFirst[state.startingPlayer] += state.winner === state.startingPlayer ? 1 : 0;
  totalTurns += state.turnCount;
}
console.log(JSON.stringify({ mode: "item", difficulty: "hard", games, wins, winsByFirst, averageTurns: Number((totalTurns / games).toFixed(1)), itemUses, itemUsesByPlayer, setupChoices }));
