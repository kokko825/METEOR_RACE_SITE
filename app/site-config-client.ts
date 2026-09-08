import { DEFAULT_SITE_CONFIG, normalizeSiteConfig, type SiteConfig } from "./site-config";

/** Share one request between theme, music and ads. Retry on a later mount after failure. */
let pending: Promise<SiteConfig> | undefined;
export function loadSiteConfig(): Promise<SiteConfig> {
  return pending ??= fetch("/api/site-config", { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error("Site configuration unavailable");
      return response.json();
    })
    .then((data) => normalizeSiteConfig(data?.config))
    .catch(() => {
      pending = undefined;
      return DEFAULT_SITE_CONFIG;
    });
}
