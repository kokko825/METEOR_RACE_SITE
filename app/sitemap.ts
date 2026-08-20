import { SITE_URL, CONTENT_LAST_MODIFIED } from "./site-url";

/**
 * Served at /sitemap.xml. Lists the public pages only — /balance is the admin
 * console and /api/* are data endpoints, neither of which should be crawled
 * (see robots.ts, which disallows both).
 */
export default function sitemap() {
  return [
    {
      url: `${SITE_URL}/`,
      lastModified: CONTENT_LAST_MODIFIED,
      changeFrequency: "weekly" as const,
      priority: 1,
    },
    {
      url: `${SITE_URL}/guide`,
      lastModified: CONTENT_LAST_MODIFIED,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/items`,
      lastModified: CONTENT_LAST_MODIFIED,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified: CONTENT_LAST_MODIFIED,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified: CONTENT_LAST_MODIFIED,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    },
  ];
}
