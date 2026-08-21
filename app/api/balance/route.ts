import { DEFAULT_BALANCE, normalizeBalance, type BalanceConfig } from "../../balance-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const balance: BalanceConfig = normalizeBalance(DEFAULT_BALANCE);
  return Response.json({ balance }, { headers: { "cache-control": "public, max-age=60" } });
}
