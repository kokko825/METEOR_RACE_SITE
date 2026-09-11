import { runTsSuite } from "./run-ts-suite.mjs";

await runTsSuite(".rules-test-fast", [
  "config/game-balance.ts",
  "app/balance-config.ts",
  "app/game-rules.ts",
  "config/ui-copy.ts",
  "app/i18n.ts",
  "app/game-status.ts",
  "tests/game-rules.test.ts",
], "tests/game-rules.test.ts");
