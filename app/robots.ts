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
        // Rendering may request these public, read-only settings. Keep private
        // profile/room endpoints blocked; robots rules are not access control.
        allow: ["/", "/api/balance$", "/api/site-config$"],
        disallow: ["/api/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
