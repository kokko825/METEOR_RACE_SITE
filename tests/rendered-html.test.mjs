import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("ships the METEOR RACE application shell and entry flow", async () => {
  const [page, layout] = await Promise.all([read("../app/page.tsx"), read("../app/layout.tsx")]);
  assert.match(layout, /METEOR RACE/);
  assert.match(page, /entryStage === "title"/);
  assert.match(page, /entry-flow \$\{rankedOpen/);
  assert.match(page, /useSiteTheme\(\)/);
  assert.doesNotMatch(page, /SkeletonPreview|codex-preview/);
});

test("keeps tunable values in versioned configuration modules", async () => {
  const [balance, site, theme] = await Promise.all([
    read("../app/balance-config.ts"),
    read("../app/site-config.ts"),
    read("../app/hooks/use-site-theme.ts"),
  ]);
  assert.match(balance, /AI_PRESETS/);
  assert.match(balance, /group: "ai"/);
  assert.match(site, /musicMeteorBaseUrl/);
  assert.match(site, /themeAccent/);
  assert.match(theme, /--panel-opacity/);
});

test("does not ship a browser-based administration screen", async () => {
  await assert.rejects(read("../app/balance/page.tsx"), { code: "ENOENT" });
  await assert.rejects(read("../app/api/admin-proxy/route.ts"), { code: "ENOENT" });
});

test("retains safe draft, publish and rollback operations", async () => {
  const [balanceApi, siteApi, versioned] = await Promise.all([
    read("../app/api/balance/route.ts"),
    read("../app/api/site-config/route.ts"),
    read("../app/versioned-config.ts"),
  ]);
  for (const source of [balanceApi, siteApi]) {
    assert.match(source, /handleVersionedConfigPost/);
  }
  assert.match(versioned, /save_draft/);
  assert.match(versioned, /publish/);
  assert.match(versioned, /rollback/);
  assert.match(versioned, /revision/);
});
