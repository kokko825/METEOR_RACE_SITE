import { runTsSuite } from "./run-ts-suite.mjs";

await runTsSuite(".ai-lab-fast", [
  "config/game-balance.ts",
  "config/ai-strategy.ts",
  "app/balance-config.ts",
  "app/game-rules.ts",
  "app/ai-engine.ts",
  "tests/ai-lab-simulation.ts",
], "tests/ai-lab-simulation.ts");
