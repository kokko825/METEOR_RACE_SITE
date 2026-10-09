/** Casual event battles; simultaneous events resolve in the order below. */
export const MATCH_EVENT_RULES = { interval: 5, warningRounds: 2, outerOrbitChancePercent: 2, orbitRingSeparation: 2 } as const;
export const MATCH_EVENT_FX = { leadMs: 650, moveMs: 900, settleMs: 120, heartbeatMs: 2200 } as const;
export const MATCH_WIND_DIRECTIONS = [
  { r: -1, c: 0 }, { r: -1, c: 1 }, { r: 0, c: 1 }, { r: 1, c: 1 },
  { r: 1, c: 0 }, { r: 1, c: -1 }, { r: 0, c: -1 }, { r: -1, c: -1 },
] as const;
export const MATCH_EVENTS = {
  off: { ja: "OFF", en: "OFF" },
  geyser: { ja: "間欠泉", en: "Geyser" },
  orbit: { ja: "ランダムORBIT", en: "Random orbit" },
  gravity: { ja: "中央重力", en: "Central gravity" },
  wind: { ja: "追い風", en: "Wind" },
} as const;
export type MatchEventKind = keyof typeof MATCH_EVENTS;
export type EventIntervals = Partial<Record<MatchEventKind, number>>;
export type EventTiming = number | EventIntervals;
export const MATCH_EVENT_ORDER: MatchEventKind[] = ["orbit", "geyser", "wind", "gravity"];
export const normalizeEventInterval = (value: unknown): number => typeof value === "number" && Number.isFinite(value) ? Math.min(99, Math.max(3, Math.trunc(value))) : MATCH_EVENT_RULES.interval;
export const normalizeEventIntervals = (value: unknown): EventIntervals => Object.fromEntries(
  MATCH_EVENT_ORDER.map((kind) => [kind, normalizeEventInterval(value && typeof value === "object" && !Array.isArray(value) ? (value as EventIntervals)[kind] : value)]),
);
/** Old rooms retain their shared numeric period; new rooms persist per-event periods. */
export const normalizeEventTiming = (value: unknown): EventTiming => value && typeof value === "object" && !Array.isArray(value) ? normalizeEventIntervals(value) : normalizeEventInterval(value);
export const normalizeMatchEvents = (value: unknown): MatchEventKind[] => {
  const values = Array.isArray(value) ? value : [value];
  return MATCH_EVENT_ORDER.filter((kind) => values.includes(kind));
};
export const normalizeMatchEvent = (value: unknown): MatchEventKind =>
  typeof value === "string" && Object.hasOwn(MATCH_EVENTS, value) ? value as MatchEventKind : "off";
/** Shared player-facing explanations for setup and the manual. */
export const MATCH_EVENT_LORE = {
  ja: "惑星の環境が引き起こすアクシデントを、AEQRISが盤面上に再現。複数のイベントを組み合わせて対戦できます。",
  en: "AEQRIS simulates hazards caused by planetary environments on the field. Combine events for a different kind of match.",
} as const;
export const MATCH_EVENT_INFO = {
  off: { icon: "−", ja: "", en: "" },
  geyser: { icon: "♨", ja: "4か所の噴出口から小メテオ相当の爆風が発生。噴出口に探査機や配置物がある場合、その場所は噴出しません。", en: "Four vents create small-meteor blasts. A vent occupied by a probe or placed object does not erupt." },
  orbit: { icon: "↻", ja: "隣り合わない2つのリングが、互いに逆方向へ90度回転。探査機も配置物も一緒に移動します。", en: "Two nonadjacent rings rotate 90 degrees in opposite directions, carrying probes and placed objects." },
  gravity: { icon: "◎", ja: "すべての探査機を、斜めも含めCOREへ1マス引き寄せます。メテオは動かず、他の探査機や障害物があれば止まります。", en: "Pulls every probe one cell toward CORE, including diagonally. Meteors stay put; probes and obstacles block movement." },
  wind: { icon: "➜", ja: "8方向から選ばれた方向へ、すべての探査機を1マス押します。メテオは動かず、他の探査機や障害物があれば止まります。", en: "Pushes all probes one cell in one of eight directions. Meteors stay put; probes and obstacles block movement." },
} as const;
