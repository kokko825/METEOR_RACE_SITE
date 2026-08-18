import { DEFAULT_SITE_CONFIG, normalizeSiteConfig, type SiteConfig } from "../../site-config";
import { handleVersionedConfigGet, handleVersionedConfigPost, type VersionedConfigSpec } from "../../versioned-config";
import { withinRateLimit, rateLimitedResponse } from "../../rate-limit";

export const dynamic = "force-dynamic";

const SPEC: VersionedConfigSpec<SiteConfig> = {
  tableName: "site_settings",
  defaults: DEFAULT_SITE_CONFIG,
  normalize: normalizeSiteConfig,
  resultKey: "config",
};

export async function GET(request: Request) {
  return handleVersionedConfigGet(request, SPEC);
}

export async function POST(request: Request) {
  if (!(await withinRateLimit(request, "site-config-post", 30, 60))) return rateLimitedResponse();
  return handleVersionedConfigPost(request, SPEC);
}
