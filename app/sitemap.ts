import { SITE_URL, CONTENT_LAST_MODIFIED } from "./site-url";

/**
 * Served at /sitemap.xml. Only the public game page is listed — /balance is the
 * admin console and /api/* are data endpoints, neither of which should be
 * crawled (see robots.ts, which disallows both).
 */
export default function sitemap() {
  return [
    {
      url: `${SITE_URL}/`,
      lastModified: CONTENT_LAST_MODIFIED,
      changeFrequency: "weekly" as const,
      priority: 1,
    },
  ];
}
