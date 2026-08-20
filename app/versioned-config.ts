import { env } from "cloudflare:workers";
import { isAdmin } from "./admin-auth";

/**
 * Shared draft/publish/rollback persistence for admin-editable config
 * (game balance, site/ads/music settings, ...). Each config type owns its
 * own D1 table (one row, id=1) with the same published/draft/previous/
 * revision shape; this module is the one place that shape is implemented,
 * so behavior changes (e.g. a future "history" feature) only happen once.
 */

type VersionedRow = {
  published_json: string;
  draft_json: string;
  previous_json: string;
  revision: number;
  updated_at: number;
};

export type VersionedConfigSpec<T> = {
  /** D1 table name. Only ever a hardcoded literal from a route file, never user input. */
  tableName: string;
  defaults: T;
  normalize: (input?: Partial<T> | null) => T;
  /** JSON key the config value is returned under, e.g. "balance" or "config". */
  resultKey: string;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

async function ensureSchema(tableName: string, defaults: unknown) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS ${tableName} (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    published_json TEXT NOT NULL,
    draft_json TEXT NOT NULL,
    previous_json TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    updated_at INTEGER NOT NULL
  )`).run();
  const defaultsJson = JSON.stringify(defaults);
  await env.DB.prepare(`INSERT OR IGNORE INTO ${tableName}
    (id, published_json, draft_json, previous_json, revision, updated_at)
    VALUES (1, ?, ?, ?, 1, ?)`)
    .bind(defaultsJson, defaultsJson, defaultsJson, Date.now())
    .run();
}

async function readRow(tableName: string, defaults: unknown): Promise<VersionedRow> {
  await ensureSchema(tableName, defaults);
  const row = await env.DB.prepare(
    `SELECT published_json, draft_json, previous_json, revision, updated_at FROM ${tableName} WHERE id = 1`,
  ).first<VersionedRow>();
  if (!row) throw new Error("versioned config row missing after ensureSchema");
  return row;
}

/**
 * Read just the published value, for server components that render config-driven
 * copy (the guide pages) and have no Request to authenticate against.
 * Throws if D1 is unreachable — callers decide the fallback.
 */
export async function readPublishedConfig<T>(spec: VersionedConfigSpec<T>): Promise<T> {
  const row = await readRow(spec.tableName, spec.defaults);
  return spec.normalize(JSON.parse(row.published_json));
}

export async function handleVersionedConfigGet<T>(request: Request, spec: VersionedConfigSpec<T>): Promise<Response> {
  let row: VersionedRow;
  try {
    row = await readRow(spec.tableName, spec.defaults);
  } catch {
    return json({ error: "設定を読み込めません" }, 500);
  }
  const admin = await isAdmin(request);
  const wantsDraft = new URL(request.url).searchParams.get("draft") === "1";
  if (wantsDraft && !admin) return json({ error: "管理者専用です" }, 403);
  return json({
    [spec.resultKey]: spec.normalize(JSON.parse(wantsDraft ? row.draft_json : row.published_json)),
    admin,
    revision: row.revision,
    updatedAt: row.updated_at,
    ...(admin ? {
      draft: spec.normalize(JSON.parse(row.draft_json)),
      previous: spec.normalize(JSON.parse(row.previous_json)),
    } : {}),
  });
}

export async function handleVersionedConfigPost<T>(request: Request, spec: VersionedConfigSpec<T>): Promise<Response> {
  if (!(await isAdmin(request))) return json({ error: "管理者専用です" }, 403);
  let row: VersionedRow;
  try {
    row = await readRow(spec.tableName, spec.defaults);
  } catch {
    return json({ error: "設定を読み込めません" }, 500);
  }
  const body = (await request.json()) as { action?: string; [key: string]: unknown };
  const { tableName, resultKey } = spec;

  if (body.action === "save_draft") {
    const draft = spec.normalize(body[resultKey] as Partial<T>);
    await env.DB.prepare(`UPDATE ${tableName} SET draft_json = ?, updated_at = ? WHERE id = 1`)
      .bind(JSON.stringify(draft), Date.now())
      .run();
    return json({ ok: true, draft, revision: row.revision });
  }

  if (body.action === "publish") {
    const draft = spec.normalize(JSON.parse(row.draft_json));
    await env.DB.prepare(`UPDATE ${tableName}
      SET previous_json = published_json, published_json = ?, revision = revision + 1, updated_at = ?
      WHERE id = 1`)
      .bind(JSON.stringify(draft), Date.now())
      .run();
    return json({ ok: true, [resultKey]: draft, revision: row.revision + 1 });
  }

  if (body.action === "rollback") {
    await env.DB.prepare(`UPDATE ${tableName}
      SET published_json = previous_json, draft_json = previous_json, previous_json = published_json,
          revision = revision + 1, updated_at = ? WHERE id = 1`)
      .bind(Date.now())
      .run();
    const updated = await readRow(tableName, spec.defaults);
    return json({ ok: true, [resultKey]: spec.normalize(JSON.parse(updated.published_json)), revision: updated.revision });
  }

  return json({ error: "操作が正しくありません" }, 400);
}
