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
  assert.match(rooms, /WAITING_ROOM_TTL_MS = 30 \* 60 \* 1000/);
  assert.match(rooms, /PLAYING_ROOM_TTL_MS = 2 \* 60 \* 60 \* 1000/);
  assert.match(rooms, /cleanupAbandonedRooms/);
  assert.match(rooms, /ROOM_HEARTBEAT_INTERVAL_MS/);
});

test("ships the fixed battle HUD, manual, chat and room lock controls", async () => {
  const [page, rooms, chat, moderation, css, profile, communitySafety] = await Promise.all([
    read("../app/page.tsx"),
    read("../app/api/rooms/route.ts"),
    read("../app/api/chat/route.ts"),
    read("../app/chat-moderation.ts"),
    read("../app/globals.css"),
    read("../app/api/profile/route.ts"),
    read("../config/community-safety.ts"),
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
  assert.match(rooms, /containsBlockedChatLanguage/);
  assert.match(chat, /room_chat_messages/);
  assert.match(chat, /COMMUNITY_SAFETY\.chatMaxLength/);
  assert.match(chat, /containsBlockedChatLanguage/);
  assert.match(chat, /ニックネームに使用できない表現/);
  assert.match(moderation, /normalize\("NFKC"\)/);
  assert.match(moderation, /BLOCKED_CHAT_PATTERNS/);
  assert.match(communitySafety, /chatPostWindowSeconds/);
  assert.match(profile, /containsBlockedChatLanguage/);
  assert.match(page, /className="free-comms"/);
  assert.match(page, /chat-toggle/);
  assert.match(page, /global-hud/);
  assert.doesNotMatch(page, /lobby-chat-toggle/);
  assert.doesNotMatch(css, /nth-last-child\(2\)\{display:none\}/);
  assert.match(css, /\.battle-hud\.global-hud\{position:fixed!important/);
  assert.match(css, /\.hud-volume button\{width:44px;height:44px/);
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

test("localizes every player-facing label in match setup", async () => {
  const [page, copy] = await Promise.all([
    read("../app/page.tsx"),
    read("../config/ui-copy.ts"),
  ]);
  for (const key of [
    "matchSetup", "onlineMatch", "casualRoomNote", "rankedDuel", "rankedClosed",
    "rankedOpen", "rankedRules", "rankedClassic", "rankedItem", "rankedRateNote",
    "casualLobbyNote", "classicRuleNote", "itemRuleNote", "freeForAll", "teamBattle",
    "onlineLobby",
  ]) assert.match(copy, new RegExp(`${key}: \\{ ja: ".+", en: ".+" \\}`));
  assert.match(page, /setupMode === "online" \? t\("onlineMatch"\) : t\("matchSetup"\)/);
  assert.match(page, /language === "en" \? "Daily 12:00–13:00 \/ 20:00–21:00 JST"/);
});

test("ships the bilingual ASTRA ACCORD world archive in the manual", async () => {
  const [page, copy, css] = await Promise.all([
    read("../app/page.tsx"),
    read("../config/ui-copy.ts"),
    read("../app/globals.css"),
  ]);
  assert.match(page, /manualPage === "world"/);
  assert.match(page, /ARCHIVE \/ ASTRA ACCORD/);
  assert.match(page, /t\("worldRegula"\)/);
  assert.match(copy, /アストラ協定/);
  assert.match(copy, /AEQRIS/);
  assert.match(copy, /非暴力の競技/);
  assert.match(copy, /nonviolent competition/);
  assert.match(css, /\.manual-world\{/);
  assert.match(css, /@media\(max-width:700px\).*?\.manual-world/s);
});

test("uses a provisional favicon and mark-free AEQRIS CORE-arrival presentation", async () => {
  const [page, matchMeta, assets, css] = await Promise.all([
    read("../app/page.tsx"),
    read("../app/components/match-meta.tsx"),
    read("../config/asset-paths.ts"),
    read("../app/globals.css"),
  ]);
  assert.match(assets, /favicon: "\/assets\/branding\/meteor-race-favicon\.svg"/);
  assert.doesNotMatch(assets, /regulaMark:/);
  assert.doesNotMatch(page, /branding\.(?:meteorRaceMark|regulaMark)/);
  assert.match(matchMeta, /AEQRIS \/\/ CORE到達管制/);
  assert.match(page, /CORE APPROACH \{regulaProgress\}%/);
  assert.match(css, /\.regula-console\{/);
  assert.match(matchMeta, /className="match-meta"/);
  assert.match(css, /\.hud-mode \.match-meta \.regula-console\{position:static/);
  assert.match(css, /\.regula-console small\{[^}]*font-size:9\.5px/);
  assert.match(css, /\.regula-console em\{[^}]*font-size:8\.5px/);
  assert.match(css, /\.hud-regula-progress\{/);
  assert.match(css, /\.manual-drawer>header \.manual-tabs button\{width:84px;min-width:84px;max-width:84px;height:38px;min-height:38px;display:inline-flex;align-items:center;justify-content:center/);
  assert.doesNotMatch(css, /\.manual-tabs button\{[^}]*text-overflow:ellipsis/);
});

test("keeps the manual inside its frame and presents device identity as company registry", async () => {
  const [page, copy, css, settings] = await Promise.all([
    read("../app/page.tsx"),
    read("../config/ui-copy.ts"),
    read("../app/globals.css"),
    read("../app/hooks/use-local-settings.ts"),
  ]);
  assert.match(copy, /AEQRIS企業登録番号/);
  assert.match(copy, /METEORは相手を妨害/);
  assert.doesNotMatch(page, /t\("accountType"\)/);
  assert.doesNotMatch(page, /t\("reduceMotion"\)/);
  assert.doesNotMatch(settings, /meteor-race-reduced-motion/);
  assert.match(settings, /prefers-reduced-motion: reduce/);
  assert.match(css, /\.manual-drawer\{display:grid;grid-template-rows:auto minmax\(0,1fr\);max-width:calc\(100vw - 12px\);overflow:hidden\}/);
  assert.match(css, /\.manual-drawer>\.manual-onepage,\.manual-drawer>\.manual-world\{[^}]*overflow-y:auto/);
  assert.match(css, /\.manual-drawer>\.manual-onepage,\.manual-drawer>\.manual-world\{[^}]*touch-action:pan-y/);
  assert.doesNotMatch(css, /\.manual-drawer>\.manual-onepage,\.manual-drawer>\.manual-world\{[^}]*overscroll-behavior:contain/);
  assert.match(css, /\.settings-drawer>header\{position:sticky;z-index:3;top:0;background:#092432\}/);
  assert.match(css, /\.entry-flow>header\{position:sticky;z-index:4;top:0/);
  assert.equal((css.match(/\.manual-drawer\{display:/g) ?? []).length, 1);
});

test("keeps carryable items and player order as shared rule constants", async () => {
  const [rules, page, ai, pieces, rooms] = await Promise.all([
    read("../app/game-rules.ts"), read("../app/page.tsx"), read("../app/ai-engine.ts"),
    read("../app/components/game-pieces.tsx"), read("../app/api/rooms/route.ts"),
  ]);
  assert.match(rules, /export const SELECTABLE_ITEMS/);
  assert.match(rules, /export const PLAYER_ORDER/);
  for (const consumer of [page, ai, pieces]) assert.match(consumer, /SELECTABLE_ITEMS/);
  assert.match(rooms, /PLAYER_ORDER\.slice\(0, playerCount\)/);
  for (const consumer of [page, ai, pieces, rooms]) assert.doesNotMatch(consumer, /\["shield", "booster", "holo", "orbit", "blast", "pulse", "recall"\]/);
});

test("documents every authorized item source and accepts balanced equipment proposals", async () => {
  const [page, lore, css, terms] = await Promise.all([
    read("../app/page.tsx"),
    read("../config/item-lore.ts"),
    read("../app/globals.css"),
    read("../app/terms/page.tsx"),
  ]);
  for (const source of ["AEGIS FRAME", "VOLTERRA DRIVE", "MIRAGE WEAVE", "KEPLER DYNAMICS", "PYRA IMPACT", "NEXWAVE SYSTEMS", "AEQRIS FIELD CONTROL"]) assert.match(lore, new RegExp(source));
  assert.match(lore, /障害物が増えすぎた競技フィールドを安全に整地/);
  assert.match(lore, /operator: true/);
  assert.match(page, /AUTHORIZED EQUIPMENT/);
  assert.match(page, /type: "アイテム提案"/);
  assert.match(page, /proposalCreditAllowed/);
  assert.match(css, /\.authorized-equipment>div\{display:grid/);
  assert.match(css, /\.supplier-proposal form\{/);
  assert.match(terms, /アイテム案の投稿/);
});

test("tags Gmail notifications by submission category", async () => {
  const contact = await read("../app/api/contact/route.ts");
  for (const tag of ["ITEM IDEA", "BUG", "FEEDBACK", "CONTACT"]) assert.match(contact, new RegExp(`return "${tag}"`));
  assert.doesNotMatch(contact, /return "ACCOUNT"/);
  const page = await read("../app/page.tsx");
  assert.doesNotMatch(page, /<option>アカウントについて<\/option>/);
  assert.match(contact, /Subject: \[METEOR RACE\]\[\$\{gmailSubjectTag\(report\.category\)\}\]\[\$\{report\.reference\}\]/);
});

test("keeps the board square and lets narrow phones scroll without fixed-control overlap", async () => {
  const [page, css] = await Promise.all([
    read("../app/page.tsx"),
    read("../app/globals.css"),
  ]);
  assert.match(css, /@media \(min-width: 561px\) and \(max-width: 900px\)/);
  assert.match(css, /width: min\(100%, calc\(100dvh - 340px\)\)/);
  assert.match(css, /@media \(max-width: 560px\)/);
  assert.match(css, /\.hud-mode > \.game-layout \{[\s\S]*?height: auto/);
  assert.match(css, /\.hud-mode \.board,[\s\S]*?aspect-ratio: 1/);
  assert.match(css, /\.battle-hud \{[\s\S]*?position: sticky/);
  assert.match(page, /phone-portrait-lock/);
  assert.match(page, /端末を縦向きにしてください/);
  assert.match(css, /orientation:landscape[\s\S]*?pointer:coarse/);
  assert.match(css, /\.hud-mode>\.phone-portrait-lock/);
  assert.match(css, /@media \(min-width:901px\)[\s\S]*?\.hud-mode \.turn-callout,[\s\S]*?\.hud-mode \.status \{ display:none; \}/);
  assert.match(css, /minmax\(360px,720px\)/);
  assert.match(css, /calc\(100dvh - 250px\)/);
  assert.doesNotMatch(css, /calc\(100dvh - 180px\)/);
  assert.match(css, /\.hud-mode \.board\{position:relative;z-index:1\}/);
  assert.match(css, /\.hud-mode \.action-panel\{position:relative;z-index:30/);
  assert.match(css, /\.shell\.entry-active \.title-screen nav \{ margin-bottom:0; \}/);
});

test("gives BOOSTER and BLAST distinct item colors", async () => {
  const [page, css] = await Promise.all([
    read("../app/page.tsx"),
    read("../app/globals.css"),
  ]);
  assert.match(css, /--item-booster: #ffd43b/);
  assert.match(css, /--item-blast: #ff7a24/);
  assert.match(css, /item-choice\.booster \{ --item-color:var\(--item-booster\)/);
  assert.match(css, /item-choice\.blast \{ --item-color:var\(--item-blast\)/);
  assert.match(page, /blast-origin-effect/);
  assert.doesNotMatch(page, /blast-effect-cell/);
  assert.match(css, /@keyframes blast-origin-wave/);
  assert.match(css, /transform:scale\(5\.05\)/);
});

test("renders player inventory as a compact icon grid on every device", async () => {
  const [page, pieces, css] = await Promise.all([
    read("../app/page.tsx"),
    read("../app/components/game-pieces.tsx"),
    read("../app/globals.css"),
  ]);
  assert.match(pieces, /inventory-slot meteor-slot/);
  assert.match(pieces, /inventory-slot inventory-item/);
  assert.doesNotMatch(pieces, /<small>SMALL<\/small>/);
  assert.doesNotMatch(pieces, /<small>\{kind\.toUpperCase\(\)\}<\/small>/);
  assert.match(css, /\.inventory \{ display:grid; grid-template-columns:repeat\(3/);
  assert.match(css, /\.hud-mode \.inventory \{[\s\S]*?grid-template-columns: repeat\(5/);
  assert.match(css, /Phone HUD: each side uses one full-width card per row/);
  assert.match(css, /grid-row: auto/);
  assert.match(css, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(page, /placement-meteor-icon small/);
  assert.match(page, /placement-meteor-icon large/);
  assert.match(css, /Short landscape screens and browser zoom use the safe scrolling game flow too/);
  assert.match(css, /Portrait tablets keep four players in two readable rows without overlap/);
});

test("keeps final rankings and rematch controls above a dimmed board", async () => {
  const [page, css] = await Promise.all([
    read("../app/page.tsx"),
    read("../app/globals.css"),
  ]);
  assert.match(page, /className="result-overlay"/);
  assert.match(page, /resultVisible \? " result-dim"/);
  assert.match(page, /className="primary-action result-rematch"/);
  assert.match(css, /\.board\.result-dim/);
  assert.match(css, /\.result-overlay \{ position:absolute; z-index:45/);
});

test("reveals results only after the CORE arrival motion settles", async () => {
  const [page, hook, behavior, copy] = await Promise.all([
    read("../app/page.tsx"),
    read("../app/hooks/use-deferred-reveal.ts"),
    read("../config/ui-behavior.ts"),
    read("../config/ui-copy.ts"),
  ]);
  assert.match(page, /blocked: isAnimating/);
  assert.match(page, /resultVisible && \(/);
  assert.match(page, /resultVisible \? " result-dim"/);
  assert.match(page, /statusCoreArrival/);
  assert.match(hook, /revealedIdentity === identity/);
  assert.match(behavior, /resultRevealDelayMs: 700/);
  assert.match(copy, /CORE到達を確認中/);
});

test("centralizes replaceable UI sounds and tactile feedback", async () => {
  const [page, controls, hook, engine, config, readme] = await Promise.all([
    read("../app/page.tsx"),
    read("../app/components/sound-controls.tsx"),
    read("../app/hooks/use-ui-feedback.ts"),
    read("../app/ui-feedback.ts"),
    read("../config/ui-feedback.ts"),
    read("../public/assets/audio/README.md"),
  ]);
  assert.match(page, /useUiFeedback\(\{ soundEnabled, masterVolume, sfxVolume \}\)/);
  assert.match(hook, /document\.addEventListener\("click", onClick\)/);
  assert.match(hook, /return \{ playVolumeTick \}/);
  assert.match(controls, /onInput=\{onTick\}/);
  assert.match(engine, /kind === "volumeTick" \? Math\.max\(18, masterVolume\)/);
  assert.match(engine, /navigator\.vibrate/);
  assert.match(config, /confirmSelector/);
  assert.match(config, /volumeTickIntervalMs: 42/);
  assert.match(readme, /config\/ui-feedback\.ts/);
  assert.match(page, /<SoundMixer/);
  assert.match(controls, /shortLabel="ALL"/);
  assert.match(controls, /shortLabel="BGM"/);
  assert.match(controls, /shortLabel="SFX"/);
});

test("uses shared spacing tokens for the battle shell", async () => {
  const css = await read("../app/globals.css");
  assert.match(css, /--page-gutter-inline:/);
  assert.match(css, /--battle-hud-height: 76px/);
  assert.match(css, /height:var\(--battle-hud-height\)/);
  assert.match(css, /height:var\(--battle-header-height\)/);
  assert.match(css, /margin-top:var\(--battle-section-gap\)/);
  assert.match(css, /padding-top:max\(28px,calc\(env\(safe-area-inset-top\) \+ 10px\)\)/);
  assert.match(css, /padding-top:max\(16px,calc\(env\(safe-area-inset-top\) \+ 6px\)\)/);
  assert.match(css, /\.hud-mode \.brand-symbol\{width:clamp\(56px,4\.7vw,72px\)/);
  assert.match(css, /\.hud-mode \.brand p\{margin-top:1px;[^}]*font-size:7px/);
  assert.match(css, /--game-ui-button:13px/);
  assert.match(css, /\.title-screen nav \.title-start,[^}]*min-height:62px/);
  assert.match(css, /\.action-panel button,[^}]*min-height:48px/);
  assert.match(css, /calc\(100dvh - 330px\)/);
  assert.match(css, /\.shell\.hud-mode\{height:100dvh;min-height:0;padding:8px 12px calc\(82px \+ env\(safe-area-inset-bottom\)\);overflow:hidden\}/);
  assert.match(css, /\.hud-mode \.arena\{height:100%;min-height:0;display:grid;grid-template-rows:auto auto minmax\(0,1fr\) auto;[^}]*overflow:hidden\}/);
  assert.match(css, /calc\(100dvh - 290px\)/);
  assert.match(css, /\.hud-mode \.action-panel\{[^}]*max-height:124px;[^}]*overflow-y:auto/);
  assert.match(css, /\.switch-setup-controls>\.meteor-choice\.item-choice\{[^}]*grid-template-columns:26px minmax\(0,1fr\);[^}]*grid-template-rows:auto auto/);
  assert.match(css, /\.switch-setup-controls>\.meteor-choice\.item-choice>b\{[^}]*grid-row:2/);
});

test("animates BLAST probe movement with lifted travel on every client", async () => {
  const [page, pieces, rooms, css] = await Promise.all([
    read("../app/page.tsx"),
    read("../app/components/game-pieces.tsx"),
    read("../app/api/rooms/route.ts"),
    read("../app/globals.css"),
  ]);
  assert.match(page, /stage: "settle"/);
  assert.match(page, /pushedProbesBetween/);
  assert.match(pieces, /blast-settle/);
  assert.match(rooms, /radius: state\.balance\?\.blastRadius[\s\S]*?pushed/);
  assert.match(css, /@keyframes probe-blast-settle/);
});

test("keeps desktop item-selection icons at their intended proportions", async () => {
  const css = await read("../app/globals.css");
  assert.match(css, /\.item-icon \{ width:22px; height:22px; min-width:22px;[\s\S]*?flex:0 0 22px/);
  assert.match(css, /\.meteor-choice\.item-choice \{[\s\S]*?overflow:hidden/);
  assert.match(css, /\.switch-setup-controls\{width:100%;display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.doesNotMatch(css, /grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/);
});

test("scales readable text and controls without resizing the board", async () => {
  const [page, css, hook, copy] = await Promise.all([
    read("../app/page.tsx"),
    read("../app/globals.css"),
    read("../app/hooks/use-local-settings.ts"),
    read("../config/ui-copy.ts"),
  ]);
  assert.match(page, /text-size-\$\{textSize\}/);
  assert.match(page, /setTextSize\("xlarge"\)/);
  assert.match(hook, /meteor-race-text-size/);
  assert.match(copy, /textSizeExtraLarge/);
  assert.match(css, /--ui-control-min/);
  assert.match(css, /font-size-adjust:var\(--ui-font-adjust\)/);
  assert.match(css, /@media\(min-width:901px\)\{\.shell\{--ui-font-adjust:\.66/);
  assert.match(css, /\.shell\.text-size-large\{--ui-font-adjust:\.76;--ui-control-min:56px/);
  assert.match(css, /\.shell\.text-size-xlarge\{--ui-font-adjust:\.88;--ui-control-min:66px/);
  assert.match(css, /\.title-copy h1\{line-height:\.8;margin-bottom:8px\}/);
  assert.match(css, /\.title-copy \.title-description\{margin-top:20px\}/);
  assert.match(css, /\.entry-panel h2\{line-height:1\.15\}/);
  assert.match(css, /\.title-copy>small\{margin-bottom:20px\}/);
  assert.match(css, /\.title-copy \.title-reading\{margin-top:22px\}/);
  assert.match(css, /\.meteor-choice\.item-choice\{justify-content:center;text-align:center\}/);
  assert.match(css, /\.text-size-xlarge \.manual-onepage/);
});

test("falls back to a safe scrollable layout when a desktop window is resized", async () => {
  const [css, safety] = await Promise.all([
    read("../app/globals.css"),
    read("../app/styles/responsive-safety.css"),
  ]);
  assert.match(css, /pointer:fine\) and \(max-width:1100px\)/);
  assert.match(css, /pointer:fine\) and \(max-height:760px\)/);
  assert.match(css, /\.shell\.hud-mode \{[\s\S]*?height:auto;[\s\S]*?overflow:visible/);
  assert.match(css, /\.hud-mode \.board,[\s\S]*?width:min\(100%,720px\)/);
  assert.match(safety, /button:not\(\.cell\)/);
  assert.match(safety, /min-height: 44px/);
  assert.match(safety, /\.shell\.online-lobby-only[\s\S]*?overflow-y:auto/);
});

test("keeps diagnostics out of ordinary player screens and item labels in sync", async () => {
  const [page, pieces, balance] = await Promise.all([
    read("../app/page.tsx"),
    read("../app/components/game-pieces.tsx"),
    read("../config/game-balance.ts"),
  ]);
  assert.match(page, /\{mode === "lab" && <details className="ai-lab-panel">/);
  assert.doesNotMatch(page, /<summary>HOW TO PLAY<\/summary>/);
  assert.doesNotMatch(page, /<summary>MISSION LOG<\/summary>/);
  assert.match(balance, /holoRounds: 4/);
  assert.doesNotMatch(pieces, /holo: "[^"]*\d+ ROUNDS"/);
  assert.doesNotMatch(pieces, /pulse: "[^"]*\d+ ROUNDS"/);
});

test("supports replaceable wordmark and symbol artwork with text fallbacks", async () => {
  const [page, css, assets] = await Promise.all([
    read("../app/page.tsx"),
    read("../app/globals.css"),
    read("../config/asset-paths.ts"),
  ]);
  assert.match(assets, /wordmark: "\/assets\/branding\/METEOR_RACE_txt\.svg"/);
  assert.match(assets, /symbol: "\/assets\/branding\/METEOR_RACE_logo\.svg"/);
  assert.match(page, /className="title-wordmark"/);
  assert.match(page, /className="title-brand-lockup"/);
  assert.match(page, /className="header-wordmark"/);
  assert.match(page, /ASSET_PATHS\.branding\.wordmark/);
  assert.match(page, /ASSET_PATHS\.branding\.symbol/);
  assert.match(page, /<h1>METEOR<br\/><span>RACE<\/span><\/h1>/);
  assert.doesNotMatch(page, /INTERPLANETARY TACTICAL RACE/);
  assert.match(css, /\.title-wordmark\.image-loaded>h1/);
  assert.match(css, /\.title-symbol\.symbol-loaded>b/);
  assert.match(css, /\.title-brand-lockup \.title-orbit/);
  assert.match(css, /@keyframes title-lockup-orbit/);
  assert.match(css, /\.header-wordmark\.image-loaded>h1/);
});

test("keeps strong-play research anonymous, verified and optional", async () => {
  const [page, route, hook, privacy] = await Promise.all([
    read("../app/page.tsx"),
    read("../app/api/strong-plays/route.ts"),
    read("../app/hooks/use-local-settings.ts"),
    read("../app/privacy/page.tsx"),
  ]);
  assert.match(page, /strongPlaySharing/);
  assert.match(route, /verifyStrongPlayCandidate/);
  assert.match(route, /JSON\.stringify\(play\)/);
  assert.doesNotMatch(route, /x-meteor-player-id|nickname|email|roomCode|chat/i);
  assert.match(hook, /if \(hydrated\) window\.localStorage\.setItem/);
  assert.match(privacy, /AIが自動学習するためには使用せず/);
});
