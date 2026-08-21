import { DEFAULT_SITE_CONFIG, normalizeSiteConfig, type SiteConfig } from "../../site-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const config: SiteConfig = normalizeSiteConfig(DEFAULT_SITE_CONFIG);
  return Response.json({ config }, { headers: { "cache-control": "public, max-age=60" } });
}
