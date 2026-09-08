import { runTsSuite } from "./run-ts-suite.mjs";

await runTsSuite(".switch-test-fast", [
  "config/game-balance.ts",
  "app/balance-config.ts",
  "app/game-rules.ts",
  "tests/switch-battle.test.ts",
], "tests/switch-battle.test.ts");
