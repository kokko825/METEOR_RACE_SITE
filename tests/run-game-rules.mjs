import { runTsSuite } from "./run-ts-suite.mjs";

await runTsSuite(".rules-test-fast", [
  "config/game-balance.ts",
  "app/balance-config.ts",
  "app/game-rules.ts",
  "tests/game-rules.test.ts",
], "tests/game-rules.test.ts");
