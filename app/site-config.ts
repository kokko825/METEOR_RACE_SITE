import { SITE_PRESENTATION } from "../config/site-presentation";

export type SiteConfig = {
  adsEnabled: number;
  adSlotTitle: number;
  adSlotResult: number;
  adSlotSettings: number;
  musicEnabled: number;
  musicCrossfadeMs: number;
  musicBpm: number;
  musicTitleUrl: string;
  musicFanfareUrl: string;
  musicWaitingUrl: string;
  musicGameStartSeUrl: string;
  musicMeteorBaseUrl: string;
  musicOrbitBaseUrl: string;
  musicZeroGravityBaseUrl: string;
  musicCosmicErrorBaseUrl: string;
  themeAccent: string;
  themeWarm: string;
  themeBackground: string;
  themeText: string;
  themeGlow: number;
  themePanelOpacity: number;
};

export const DEFAULT_SITE_CONFIG: SiteConfig = { ...SITE_PRESENTATION };

export const SITE_CONFIG_TOGGLE_FIELDS = [
  { key: "adsEnabled", externalKey: "ads.enabled", label: "広告全体スイッチ", min: 0, max: 1, unit: "0=OFF / 1=ON" },
  { key: "adSlotTitle", externalKey: "ads.slot.title", label: "タイトル画面の広告枠", min: 0, max: 1, unit: "0=OFF / 1=ON" },
  { key: "adSlotResult", externalKey: "ads.slot.result", label: "対戦結果画面の広告枠", min: 0, max: 1, unit: "0=OFF / 1=ON" },
  { key: "adSlotSettings", externalKey: "ads.slot.settings", label: "SETTINGS画面の広告枠", min: 0, max: 1, unit: "0=OFF / 1=ON" },
  { key: "musicEnabled", externalKey: "music.enabled", label: "インタラクティブミュージック", min: 0, max: 1, unit: "0=OFF / 1=ON" },
  { key: "musicCrossfadeMs", externalKey: "music.crossfade_ms", label: "音楽クロスフェード時間", min: 100, max: 3000, unit: "ミリ秒" },
  { key: "musicBpm", externalKey: "music.bpm", label: "戦闘BGMのBPM（小節頭切替の基準）", min: 60, max: 200, unit: "BPM" },
] as const satisfies ReadonlyArray<{
  key: keyof SiteConfig;
  externalKey: string;
  label: string;
  min: number;
  max: number;
  unit: string;
}>;

/**
 * Shared, single-instance music assets (title theme / fanfare / waiting BGM /
 * game-start SE). Per-battle-track 5-stem file sets are NOT here — with 4
 * tracks × 5 stems that's too many fields for a hand-edited admin grid, so
 * those live as a code-level config (see app/music-engine.ts) edited when
 * real music files are dropped into public/music/.
 */
export const SITE_CONFIG_TRACK_FIELDS = [
  { key: "musicTitleUrl", externalKey: "music.title_url", label: "タイトルBGM URL" },
  { key: "musicFanfareUrl", externalKey: "music.fanfare_url", label: "勝利ファンファーレ URL" },
  { key: "musicWaitingUrl", externalKey: "music.waiting_url", label: "待機BGM URL" },
  { key: "musicGameStartSeUrl", externalKey: "music.game_start_se_url", label: "GAME START SE URL" },
  { key: "musicMeteorBaseUrl", externalKey: "music.battle.meteor_base_url", label: "METEOR 5ステムフォルダ" },
  { key: "musicOrbitBaseUrl", externalKey: "music.battle.orbit_base_url", label: "ORBIT 5ステムフォルダ" },
  { key: "musicZeroGravityBaseUrl", externalKey: "music.battle.zero_gravity_base_url", label: "ZERO GRAVITY 5ステムフォルダ" },
  { key: "musicCosmicErrorBaseUrl", externalKey: "music.battle.cosmic_error_base_url", label: "COSMIC ERROR 5ステムフォルダ" },
] as const satisfies ReadonlyArray<{ key: keyof SiteConfig; externalKey: string; label: string }>;

export const SITE_CONFIG_THEME_COLOR_FIELDS = [
  { key: "themeAccent", externalKey: "theme.accent", label: "メイン発光色" },
  { key: "themeWarm", externalKey: "theme.warm", label: "強調・開始色" },
  { key: "themeBackground", externalKey: "theme.background", label: "宇宙背景色" },
  { key: "themeText", externalKey: "theme.text", label: "基本文字色" },
] as const satisfies ReadonlyArray<{ key: keyof SiteConfig; externalKey: string; label: string }>;

export const SITE_CONFIG_THEME_NUMBER_FIELDS = [
  { key: "themeGlow", externalKey: "theme.glow", label: "発光の強さ", min: 0, max: 160, unit: "%" },
  { key: "themePanelOpacity", externalKey: "theme.panel_opacity", label: "パネル不透明度", min: 55, max: 100, unit: "%" },
] as const satisfies ReadonlyArray<{ key: keyof SiteConfig; externalKey: string; label: string; min: number; max: number; unit: string }>;

export function normalizeSiteConfig(input?: Partial<SiteConfig> | null): SiteConfig {
  const next = { ...DEFAULT_SITE_CONFIG, ...(input ?? {}) };
  for (const field of SITE_CONFIG_TOGGLE_FIELDS) {
    const value = Number(next[field.key]);
    next[field.key] = Math.max(field.min, Math.min(field.max, Number.isFinite(value) ? Math.round(value) : DEFAULT_SITE_CONFIG[field.key]));
  }
  for (const field of SITE_CONFIG_TRACK_FIELDS) {
    const value = next[field.key];
    next[field.key] = typeof value === "string" ? value.trim().slice(0, 500) : "";
  }
  for (const field of SITE_CONFIG_THEME_COLOR_FIELDS) {
    const value = next[field.key];
    next[field.key] = typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim())
      ? value.trim().toLowerCase()
      : DEFAULT_SITE_CONFIG[field.key];
  }
  for (const field of SITE_CONFIG_THEME_NUMBER_FIELDS) {
    const value = Number(next[field.key]);
    next[field.key] = Math.max(field.min, Math.min(field.max, Number.isFinite(value) ? Math.round(value) : DEFAULT_SITE_CONFIG[field.key]));
  }
  return next;
}
