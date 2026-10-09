import { runTsSuite } from "./run-ts-suite.mjs";

await runTsSuite("ui", [
  "config/game-balance.ts", "config/ui-copy.ts", "config/item-lore.ts",
  "app/balance-config.ts", "app/game-rules.ts", "app/item-content.ts", "app/i18n.ts",
  "app/components/game-pieces.tsx", "app/components/manual-content.tsx",
  "app/components/sound-controls.tsx", "tests/ui-components.test.ts",
  "app/components/match-events.tsx", "app/components/loadout-preview.tsx", "app/board-preview.ts", "app/game-status.ts", "app/ranked-schedule.ts",
], "tests/ui-components.test.ts");
