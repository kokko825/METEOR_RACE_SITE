/** Casual event battles; simultaneous events resolve in the order below. */
export const MATCH_EVENT_RULES = { interval: 5, warningRounds: 2, outerOrbitChancePercent: 2, orbitRingSeparation: 2 } as const;
export const MATCH_EVENT_FX = { leadMs: 180, moveMs: 900, settleMs: 120, heartbeatMs: 2200 } as const;
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
export const MATCH_EVENT_ORDER: MatchEventKind[] = ["orbit", "geyser", "wind", "gravity"];
export const normalizeEventInterval = (value: unknown): number => typeof value === "number" && Number.isFinite(value) ? Math.min(99, Math.max(3, Math.trunc(value))) : MATCH_EVENT_RULES.interval;
export const normalizeMatchEvents = (value: unknown): MatchEventKind[] => {
  const values = Array.isArray(value) ? value : [value];
  return MATCH_EVENT_ORDER.filter((kind) => values.includes(kind));
};
export const normalizeMatchEvent = (value: unknown): MatchEventKind =>
  typeof value === "string" && Object.hasOwn(MATCH_EVENTS, value) ? value as MatchEventKind : "off";
