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

test("keeps human-editable values separate from application logic", async () => {
  const [balance, site, editableBalance, editableSite, theme] = await Promise.all([
    read("../app/balance-config.ts"),
    read("../app/site-config.ts"),
    read("../config/game-balance.ts"),
    read("../config/site-presentation.ts"),
    read("../app/hooks/use-site-theme.ts"),
  ]);
  assert.match(balance, /AI_PRESETS/);
  assert.match(balance, /group: "ai"/);
  assert.match(site, /musicMeteorBaseUrl/);
  assert.match(site, /themeAccent/);
  assert.match(editableBalance, /rankedGravityRounds: 5/);
  assert.match(editableSite, /musicTitleUrl/);
  assert.match(theme, /--panel-opacity/);
});

test("keeps the public game discoverable by search engines", async () => {
  const [page, layout, guide, items] = await Promise.all([
    read("../app/page.tsx"),
    read("../app/layout.tsx"),
    read("../app/guide/page.tsx"),
    read("../app/items/page.tsx"),
  ]);
  assert.match(layout, /\["VideoGame", "WebApplication"\]/);
  assert.match(layout, /price: "0"/);
  assert.match(page, /無料オンライン戦略ボードゲーム/);
  assert.match(page, /href="\/guide"/);
  assert.match(page, /href="\/items"/);
  assert.match(guide, /alternates: \{ canonical: "\/guide" \}/);
  assert.match(items, /alternates: \{ canonical: "\/items" \}/);
});

test("does not ship a browser-based administration screen", async () => {
  await assert.rejects(read("../app/balance/page.tsx"), { code: "ENOENT" });
  await assert.rejects(read("../app/api/admin-proxy/route.ts"), { code: "ENOENT" });
});

test("serves read-only configuration from Git-versioned files", async () => {
  const [balanceApi, siteApi] = await Promise.all([
    read("../app/api/balance/route.ts"),
    read("../app/api/site-config/route.ts"),
  ]);
  for (const source of [balanceApi, siteApi]) {
    assert.match(source, /export async function GET/);
    assert.doesNotMatch(source, /export async function POST/);
  }
  await assert.rejects(read("../app/versioned-config.ts"), { code: "ENOENT" });
  await assert.rejects(read("../app/admin-auth.ts"), { code: "ENOENT" });
});

test("keeps online room settings authoritative and bounded", async () => {
  const rooms = await read("../app/api/rooms/route.ts");
  assert.match(rooms, /body\.humanCount/);
  assert.match(rooms, /body\.aiCount/);
  assert.match(rooms, /\[9, 11, 13, 15\]/);
  assert.match(rooms, /slice\(0, room\.max_players\)/);
  assert.doesNotMatch(rooms, /max_players = 4/);
  assert.doesNotMatch(rooms, /balance_settings/);
});
