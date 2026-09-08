import { runTsSuite } from "./run-ts-suite.mjs";

await runTsSuite(".config-test-fast", [
  "config/game-balance.ts",
  "config/site-presentation.ts",
  "config/ai-strategy.ts",
  "config/ui-behavior.ts",
  "config/ui-copy.ts",
  "app/balance-config.ts",
  "app/site-config.ts",
  "app/site-config-client.ts",
  "tests/config-validation.test.ts",
], "tests/config-validation.test.ts");
