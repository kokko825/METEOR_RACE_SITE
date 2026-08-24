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
  const [balance, site, editableBalance, editableSite, theme, ai, uiBehavior, copy, configGuide] = await Promise.all([
    read("../app/balance-config.ts"),
    read("../app/site-config.ts"),
    read("../config/game-balance.ts"),
    read("../config/site-presentation.ts"),
    read("../app/hooks/use-site-theme.ts"),
    read("../config/ai-strategy.ts"),
    read("../config/ui-behavior.ts"),
    read("../config/ui-copy.ts"),
    read("../config/README.md"),
  ]);
  assert.match(balance, /AI_PRESETS/);
  assert.match(balance, /group: "ai"/);
  assert.match(site, /musicMeteorBaseUrl/);
  assert.match(site, /themeAccent/);
  assert.match(editableBalance, /rankedGravityRounds: 5/);
  assert.match(editableSite, /musicTitleUrl/);
  assert.match(theme, /--panel-opacity/);
  assert.match(ai, /multiplayerWarningWithMeteor/);
  assert.match(uiBehavior, /aiDefaultDelayMs/);
  assert.match(copy, /titleDescription/);
  assert.match(configGuide, /どこを変更するか/);
});

test("keeps the public game discoverable by search engines", async () => {
  const [page, layout, guide, items, copy] = await Promise.all([
    read("../app/page.tsx"),
    read("../app/layout.tsx"),
    read("../app/guide/page.tsx"),
    read("../app/items/page.tsx"),
    read("../config/ui-copy.ts"),
  ]);
  assert.match(layout, /\["VideoGame", "WebApplication"\]/);
  assert.match(layout, /price: "0"/);
  assert.match(layout, /const TITLE = "メテオレース \| METEOR RACE"/);
  assert.match(copy, /無料オンライン戦略ボードゲーム/);
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
  assert.match(rooms, /body\.action === "manage_member"/);
  assert.match(rooms, /body\.action === "assign_teams"/);
  assert.match(rooms, /body\.action === "swap_role"/);
  assert.match(rooms, /room\.status === "waiting"/);
  assert.match(rooms, /seats\[openSlot\] = null/);
  assert.doesNotMatch(rooms, /max_players = 4/);
  assert.doesNotMatch(rooms, /balance_settings/);
});

test("ships the fixed battle HUD, manual, chat and room lock controls", async () => {
  const [page, rooms, chat] = await Promise.all([
    read("../app/page.tsx"),
    read("../app/api/rooms/route.ts"),
    read("../app/api/chat/route.ts"),
  ]);
  assert.match(page, /METEOR RACE \/ MANUAL/);
  assert.match(page, /battle-hud/);
  assert.match(page, /QUICK_CHAT_MESSAGES/);
  assert.match(page, /toggleRoomLock/);
  assert.match(page, /CPU \{index\+1\}/);
  assert.match(page, /setEntryStage\("rule"\)/);
  assert.match(page, /online-main-return/);
  assert.match(page, /ゲームモードへ戻る/);
  assert.match(rooms, /roomJoinLocked/);
  assert.match(chat, /room_chat_messages/);
  assert.match(chat, /QUICK_MESSAGES/);
});

test("offers a persistent Japanese and English language switch", async () => {
  const [page, settings, copy] = await Promise.all([
    read("../app/page.tsx"),
    read("../app/hooks/use-local-settings.ts"),
    read("../config/ui-copy.ts"),
  ]);
  assert.match(page, /t\("languageHeading"\)/);
  assert.match(page, /t\("japaneseLanguage"\)/);
  assert.match(page, /t\("englishLanguage"\)/);
  assert.match(settings, /meteor-race-language/);
  assert.match(settings, /document\.documentElement\.lang = language/);
  assert.match(page, /uiText\(language, key\)/);
  assert.match(copy, /titleDescription/);
  assert.match(copy, /japaneseLanguage: \{ ja: "日本語", en: "Japanese" \}/);
});

test("keeps the board square and lets narrow phones scroll without fixed-control overlap", async () => {
  const css = await read("../app/globals.css");
  assert.match(css, /@media \(min-width: 561px\) and \(max-width: 900px\)/);
  assert.match(css, /width: min\(100%, calc\(100dvh - 340px\)\)/);
  assert.match(css, /@media \(max-width: 560px\)/);
  assert.match(css, /\.hud-mode > \.game-layout \{[\s\S]*?height: auto/);
  assert.match(css, /\.hud-mode \.board,[\s\S]*?aspect-ratio: 1/);
  assert.match(css, /\.battle-hud \{[\s\S]*?position: sticky/);
});

test("gives BOOSTER and BLAST distinct item colors", async () => {
  const css = await read("../app/globals.css");
  assert.match(css, /--item-booster: #ffd43b/);
  assert.match(css, /--item-blast: #ff3b30/);
  assert.match(css, /item-choice\.booster \{ --item-color:var\(--item-booster\)/);
  assert.match(css, /item-choice\.blast \{ --item-color:var\(--item-blast\)/);
});

test("renders player inventory as a compact icon grid on every device", async () => {
  const [page, css] = await Promise.all([
    read("../app/page.tsx"),
    read("../app/globals.css"),
  ]);
  assert.match(page, /inventory-meteors/);
  assert.match(page, /inventory-slot inventory-item/);
  assert.match(page, /<small>SMALL<\/small>/);
  assert.doesNotMatch(page, /<small>\{kind\.toUpperCase\(\)\}<\/small>/);
  assert.match(css, /\.inventory-meteors \{ display:grid; grid-template-columns:repeat\(2/);
  assert.match(css, /\.inventory-items \{ display:grid; grid-template-columns:repeat\(3/);
  assert.match(css, /\.hud-mode \.inventory-meteors \{ grid-template-columns:repeat\(2/);
});
