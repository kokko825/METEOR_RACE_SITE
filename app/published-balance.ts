import { DEFAULT_BALANCE, normalizeBalance, type BalanceConfig } from "./balance-config";
import { readPublishedConfig } from "./versioned-config";

/**
 * Server-only. Kept out of balance-config.ts because that module is imported by
 * client components, and this pulls in the D1 binding via versioned-config.
 *
 * The guide pages quote tunable numbers ("1巡の間", "外周1マス"), so they read
 * the published balance rather than the compiled defaults — otherwise the
 * documentation stays aligned when the published values are tuned in code.
 * A D1 hiccup falls back to the defaults instead of failing the page: stale
 * numbers on a content page beat a 500.
 */
export async function getPublishedBalance(): Promise<BalanceConfig> {
  try {
    return await readPublishedConfig({
      tableName: "balance_settings",
      defaults: DEFAULT_BALANCE,
      normalize: normalizeBalance,
      resultKey: "balance",
    });
  } catch {
    return DEFAULT_BALANCE;
  }
}
