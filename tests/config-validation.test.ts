import assert from "node:assert/strict";
import { GAME_BALANCE } from "../config/game-balance";
import { SITE_PRESENTATION } from "../config/site-presentation";
import { balanceWarnings, normalizeBalance } from "../app/balance-config";
import { normalizeSiteConfig } from "../app/site-config";
import { AI_STRATEGY } from "../config/ai-strategy";
import { UI_BEHAVIOR } from "../config/ui-behavior";
import { UI_COPY } from "../config/ui-copy";

assert.deepEqual(
  normalizeBalance(GAME_BALANCE),
  GAME_BALANCE,
  "config/game-balance.ts contains an out-of-range or inconsistent value",
);

assert.ok(AI_STRATEGY.score.win > AI_STRATEGY.score.rankStep * 4, "AI win score must dominate rank steps");
assert.ok(AI_STRATEGY.pacing.classicRetreatPenalty > AI_STRATEGY.pacing.itemRetreatPenalty, "classic retreat must remain less attractive than item-mode retreat");
assert.ok(UI_BEHAVIOR.aiDefaultDelayMs >= UI_BEHAVIOR.aiMinimumDelayMs, "default AI delay must respect the minimum");
for (const [key, copy] of Object.entries(UI_COPY)) {
  assert.ok(copy.ja.trim() && copy.en.trim(), `UI_COPY.${key} must contain both Japanese and English`);
}
assert.deepEqual(
  normalizeSiteConfig(SITE_PRESENTATION),
  SITE_PRESENTATION,
  "config/site-presentation.ts contains an invalid value",
);

const warnings = balanceWarnings(GAME_BALANCE);
if (warnings.length) {
  console.warn(`balance warnings:\n- ${warnings.join("\n- ")}`);
}
console.log("editable-config: all checks passed");
