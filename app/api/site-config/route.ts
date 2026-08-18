import { env } from "cloudflare:workers";
import { DEFAULT_SITE_CONFIG, normalizeSiteConfig, type SiteConfig } from "../../site-config";
import { isAdmin } from "../../admin-auth";
import { withinRateLimit, rateLimitedResponse } from "../../rate-limit";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

async function ensureSiteConfigSchema() {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS site_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    published_json TEXT NOT NULL,
    draft_json TEXT NOT NULL,
    previous_json TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    updated_at INTEGER NOT NULL
  )`).run();
  const defaults = JSON.stringify(DEFAULT_SITE_CONFIG);
  await env.DB.prepare(`INSERT OR IGNORE INTO site_settings
    (id, published_json, draft_json, previous_json, revision, updated_at)
    VALUES (1, ?, ?, ?, 1, ?)`)
    .bind(defaults, defaults, defaults, Date.now())
    .run();
}

async function readRow() {
  await ensureSiteConfigSchema();
  return env.DB.prepare("SELECT published_json, draft_json, previous_json, revision, updated_at FROM site_settings WHERE id = 1")
    .first<{ published_json: string; draft_json: string; previous_json: string; revision: number; updated_at: number }>();
}

export async function GET(request: Request) {
  const row = await readRow();
  if (!row) return json({ error: "サイト設定を読み込めません" }, 500);
  const admin = await isAdmin(request);
  const wantsDraft = new URL(request.url).searchParams.get("draft") === "1";
  if (wantsDraft && !admin) return json({ error: "管理者専用です" }, 403);
  return json({
    config: normalizeSiteConfig(JSON.parse(wantsDraft ? row.draft_json : row.published_json)),
    admin,
    revision: row.revision,
    updatedAt: row.updated_at,
    ...(admin ? {
      draft: normalizeSiteConfig(JSON.parse(row.draft_json)),
      previous: normalizeSiteConfig(JSON.parse(row.previous_json)),
    } : {}),
  });
}

export async function POST(request: Request) {
  if (!(await withinRateLimit(request, "site-config-post", 30, 60))) return rateLimitedResponse();
  if (!(await isAdmin(request))) return json({ error: "管理者専用です" }, 403);
  const row = await readRow();
  if (!row) return json({ error: "サイト設定を読み込めません" }, 500);
  const body = await request.json() as { action?: string; config?: Partial<SiteConfig> };
  if (body.action === "save_draft") {
    const draft = normalizeSiteConfig(body.config);
    await env.DB.prepare("UPDATE site_settings SET draft_json = ?, updated_at = ? WHERE id = 1")
      .bind(JSON.stringify(draft), Date.now())
      .run();
    return json({ ok: true, draft, revision: row.revision });
  }
  if (body.action === "publish") {
    const draft = normalizeSiteConfig(JSON.parse(row.draft_json));
    await env.DB.prepare(`UPDATE site_settings
      SET previous_json = published_json, published_json = ?, revision = revision + 1, updated_at = ?
      WHERE id = 1`)
      .bind(JSON.stringify(draft), Date.now())
      .run();
    return json({ ok: true, config: draft, revision: row.revision + 1 });
  }
  if (body.action === "rollback") {
    await env.DB.prepare(`UPDATE site_settings
      SET published_json = previous_json, draft_json = previous_json, previous_json = published_json,
          revision = revision + 1, updated_at = ? WHERE id = 1`)
      .bind(Date.now())
      .run();
    const updated = await readRow();
    return json({ ok: true, config: normalizeSiteConfig(JSON.parse(updated!.published_json)), revision: updated!.revision });
  }
  return json({ error: "操作が正しくありません" }, 400);
}
