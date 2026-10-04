import { runTsSuite } from "./run-ts-suite.mjs";

await runTsSuite("strong-play", [
  "config/game-balance.ts",
  "app/balance-config.ts",
  "app/game-rules.ts",
  "app/strong-play.ts",
  "tests/strong-play.test.ts",
], "tests/strong-play.test.ts");
