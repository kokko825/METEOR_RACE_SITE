import { chooseAiDecision, type AiDifficulty } from "../app/ai-engine.js";
import {
  applyMeteor,
  applyMove,
  applyPass,
  finishTurn,
  initialGameState,
  type GameState,
  type GameVariant,
  type Player,
} from "../app/game-rules.js";

function play(state: GameState, difficulty: AiDifficulty, seed: number) {
  let guard = 0;
  const random = () => {
    seed = (Math.imul(seed >>> 0, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  while (state.phase !== "over" && guard < 260) {
    const decision = chooseAiDecision(state, difficulty, random);
    if (decision.type === "move") state = applyMove(state, decision.target);
    else if (decision.type === "meteor") {
      state = applyMeteor(state, decision.target, decision.size, decision.useCapsule).state;
    } else if (decision.type === "pass") state = applyPass(state);
    else state = finishTurn(state, "AI skip");
    guard += 1;
  }
  return state;
}

const scenarios: Array<{ variant: GameVariant; size: number; count: number }> = [
  { variant: "classic", size: 9, count: 2 },
  { variant: "classic", size: 11, count: 4 },
  { variant: "team", size: 11, count: 4 },
  { variant: "team", size: 15, count: 4 },
  { variant: "item", size: 15, count: 4 },
];

const requestedDifficulty = process.argv[2] as AiDifficulty | undefined;
const difficulties: AiDifficulty[] = requestedDifficulty
  ? [requestedDifficulty]
  : ["easy", "normal", "hard"];

for (const difficulty of difficulties) {
  for (const scenario of scenarios) {
    const wins: Record<string, number> = { red: 0, blue: 0, green: 0, yellow: 0, draw: 0 };
    let turns = 0;
    const games = 4;
    for (let index = 0; index < games; index += 1) {
      const players = (["red", "blue", "green", "yellow"] as Player[]).slice(0, scenario.count);
      const first = players[index % players.length];
      const final = play(
        initialGameState(
          scenario.size,
          first,
          scenario.count,
          false,
          index % 4,
          players,
          scenario.variant,
        ),
        difficulty,
        1009 + index * 7919 + scenario.size * 101,
      );
      wins[final.winner ?? "draw"] += 1;
      turns += final.turnCount;
    }
    console.log(
      JSON.stringify({
        difficulty,
        ...scenario,
        games,
        wins,
        averageTurns: Math.round((turns / games) * 10) / 10,
      }),
    );
  }
}
