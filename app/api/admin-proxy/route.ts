const PRODUCTION_ORIGIN = "https://meteorrace.follnest.com";
const RESOURCES = new Set(["balance", "site-config"]);

function targetUrl(request: Request) {
  const incoming = new URL(request.url);
  const resource = incoming.searchParams.get("resource") ?? "";
  if (!RESOURCES.has(resource)) return null;
  const target = new URL(`/api/${resource}`, PRODUCTION_ORIGIN);
  if (incoming.searchParams.get("draft") === "1") target.searchParams.set("draft", "1");
  return target;
}

function unavailable() {
  return Response.json({ error: "ローカル管理ツール専用です" }, { status: 404 });
}

export async function GET(request: Request) {
  if (process.env.NODE_ENV !== "development") return unavailable();
  const target = targetUrl(request);
  if (!target) return Response.json({ error: "対象が正しくありません" }, { status: 400 });
  const response = await fetch(target, {
    headers: { authorization: request.headers.get("authorization") ?? "" },
    cache: "no-store",
  });
  return new Response(response.body, { status: response.status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") return unavailable();
  const target = targetUrl(request);
  if (!target) return Response.json({ error: "対象が正しくありません" }, { status: 400 });
  const response = await fetch(target, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: request.headers.get("authorization") ?? "" },
    body: await request.text(),
  });
  return new Response(response.body, { status: response.status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
