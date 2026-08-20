import { SITE_URL } from "./site-url";

/**
 * Served at /robots.txt.
 *
 * Cloudflare appends its own managed block (the AI-crawler Content-Signal
 * rules) after whatever the origin returns, so this only needs to state the
 * site's own crawl policy — most importantly the Sitemap line, which is how a
 * crawler that arrives without Search Console still finds /sitemap.xml.
 */
export default function robots() {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // The admin console and the JSON endpoints have nothing to index, and
        // crawling them just burns crawl budget on pages that 403 or return
        // machine-readable state.
        disallow: ["/api/", "/balance"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
