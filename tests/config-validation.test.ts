import assert from "node:assert/strict";
import { GAME_BALANCE } from "../config/game-balance";
import { SITE_PRESENTATION } from "../config/site-presentation";
import { balanceWarnings, normalizeBalance } from "../app/balance-config";
import { normalizeSiteConfig } from "../app/site-config";

assert.deepEqual(
  normalizeBalance(GAME_BALANCE),
  GAME_BALANCE,
  "config/game-balance.ts contains an out-of-range or inconsistent value",
);
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
