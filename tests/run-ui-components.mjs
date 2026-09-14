import { runTsSuite } from "./run-ts-suite.mjs";

await runTsSuite(".ui-test-fast", [
  "config/game-balance.ts", "config/ui-copy.ts", "config/item-lore.ts",
  "app/balance-config.ts", "app/game-rules.ts", "app/item-content.ts", "app/i18n.ts",
  "app/components/game-pieces.tsx", "app/components/manual-content.tsx",
  "app/components/sound-controls.tsx", "tests/ui-components.test.ts",
], "tests/ui-components.test.ts");
