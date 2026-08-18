import { DEFAULT_BALANCE, normalizeBalance, type BalanceConfig } from "../../balance-config";
import { handleVersionedConfigGet, handleVersionedConfigPost, type VersionedConfigSpec } from "../../versioned-config";
import { withinRateLimit, rateLimitedResponse } from "../../rate-limit";

export const dynamic = "force-dynamic";

const SPEC: VersionedConfigSpec<BalanceConfig> = {
  tableName: "balance_settings",
  defaults: DEFAULT_BALANCE,
  normalize: normalizeBalance,
  resultKey: "balance",
};

export async function GET(request: Request) {
  return handleVersionedConfigGet(request, SPEC);
}

export async function POST(request: Request) {
  if (!(await withinRateLimit(request, "balance-post", 30, 60))) return rateLimitedResponse();
  return handleVersionedConfigPost(request, SPEC);
}
