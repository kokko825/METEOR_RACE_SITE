import { SITE_URL, CONTENT_LAST_MODIFIED } from "./site-url";

/**
 * Served at /sitemap.xml. Lists public pages only; /api/* contains data
 * endpoints and is excluded by robots.ts.
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
      url: `${SITE_URL}/policy`,
      lastModified: CONTENT_LAST_MODIFIED,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    },
  ];
}
