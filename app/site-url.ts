/**
 * Canonical public origin, shared by the metadata, sitemap and robots routes so
 * they can never drift apart. Update this (and redeploy) if the domain changes.
 */
export const SITE_URL = "https://meteorrace.follnest.com";

/**
 * Last date the indexable content meaningfully changed. Deliberately a fixed
 * literal rather than `new Date()`: a sitemap that reports "modified just now"
 * on every crawl teaches Google to distrust the field. Bump it when the public
 * page's content actually changes.
 */
export const CONTENT_LAST_MODIFIED = "2026-08-20";
