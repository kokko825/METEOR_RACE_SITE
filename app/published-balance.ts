import { DEFAULT_BALANCE, normalizeBalance, type BalanceConfig } from "./balance-config";

/**
 * Guide pages and the game use the same Git-versioned source. Keeping this
 * async preserves the server-component call sites without a database layer.
 */
export async function getPublishedBalance(): Promise<BalanceConfig> {
  return normalizeBalance(DEFAULT_BALANCE);
}
