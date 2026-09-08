import { runTsSuite } from "./run-ts-suite.mjs";

await runTsSuite(".switch-ai-fast", [
  "config/game-balance.ts",
  "config/ai-strategy.ts",
  "app/balance-config.ts",
  "app/game-rules.ts",
  "app/ai-engine.ts",
  "tests/switch-ai-simulation.ts",
], "tests/switch-ai-simulation.ts");
