export const dynamic = "force-dynamic";

function maskedEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "連携済み";
  return `${local.slice(0, 2)}${"*".repeat(Math.max(2, Math.min(6, local.length - 2)))}@${domain}`;
}

export async function GET(request: Request) {
  const email = (request.headers.get("cf-access-authenticated-user-email") ??
    request.headers.get("oai-authenticated-user-email"))?.trim().toLowerCase();
  return Response.json({ email: email ? maskedEmail(email) : "未連携" }, {
    headers: { "Cache-Control": "no-store" },
  });
}
