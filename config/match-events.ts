/** Casual event battles; simultaneous events resolve in the order below. */
export const MATCH_EVENT_RULES = { windSteps: 2, interval: 5, warningRounds: 2, outerOrbitChancePercent: 2, orbitMinRing: 2, geyserCount: 4, geyserSeparation: 2, gravityMinCoreDistance: 3, orbitRingSeparation: 2, gravityRadius: 5, gravityStrongRadius: 2, gravityStrongSteps: 2, gravityCenterInset: 2, warpInnerRing: 2, warpOuterInset: 1 } as const;
export const MATCH_EVENT_FX = { leadMs: 650, moveMs: 900, settleMs: 120, heartbeatMs: 2200 } as const;
export const MATCH_WIND_DIRECTIONS = [
  { r: -1, c: 0 }, { r: -1, c: 1 }, { r: 0, c: 1 }, { r: 1, c: 1 },
  { r: 1, c: 0 }, { r: 1, c: -1 }, { r: 0, c: -1 }, { r: -1, c: -1 },
] as const;
export const MATCH_EVENTS = {
  off: { ja: "OFF", en: "OFF" },
  geyser: { ja: "間欠泉", en: "Geyser" },
  orbit: { ja: "ランダムORBIT", en: "Random orbit" },
  gravity: { ja: "重力異常", en: "Gravity anomaly" },
  wind: { ja: "暴風", en: "Gale" },
  warp: { ja: "ワープ", en: "Warp gates" },
} as const;
export type MatchEventKind = keyof typeof MATCH_EVENTS;
export type EventIntervals = Partial<Record<MatchEventKind, number>>;
export type EventTiming = number | EventIntervals;
export const MATCH_EVENT_ORDER: MatchEventKind[] = ["wind", "orbit", "geyser", "gravity", "warp"];
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
/** One shared board policy for setup and online rooms; larger selections are retained. */
export function eventBoardSizes(events: unknown, team = false, item = false): number[] {
  const count = normalizeMatchEvents(events).length;
  return team || count >= 2 ? [13, 15] : count === 1 || item ? [11, 13, 15] : [9, 11];
}
export function normalizeEventBoardSize(size: number, events: unknown, team = false, item = false): number {
  const sizes = eventBoardSizes(events, team, item);
  return sizes.find((candidate) => candidate >= size) ?? sizes[sizes.length - 1];
}
/** Shared player-facing explanations for setup and the manual. */
export const MATCH_EVENT_LORE = {
  ja: "惑星の環境が引き起こすアクシデントを、AEQRISが盤面上に再現。複数のイベントを組み合わせて対戦できます。",
  en: "AEQRIS simulates hazards caused by planetary environments on the field. Combine events for a different kind of match.",
} as const;
export const MATCH_EVENT_INFO = {
  off: { icon: "−", ja: "", en: "" },
  warp: { icon: "⟷", ja: "COREから2周目と外周付近を結ぶワープマスが常時1組出現。着地すると反対側へ転送されます。出口が塞がっている場合は不発。周期ごとに予告なしで位置が変わります。配置物・機体・間欠泉の噴出口・重力の中心には出現しません。", en: "One gate pair links the second ring from CORE to the outer region. Landing on a gate teleports the probe unless the exit is occupied. Locations change periodically without advance location warnings. Gates avoid probes, placed objects, geyser vents and gravity origins." },
  geyser: { icon: "♨", ja: "盤面にランダムに分布する4か所の噴出口から蒸気が噴き出し、周囲の探査機を1マス押します。配置物は壊れず、移動先が塞がっていれば動きません。噴出口が塞がっている場所は噴出しません。赤い斜線は噴出予告（進入可）、白い縁は現在塞がれた噴出口を示します。SHIELDは蒸気の押し出しを防ぎます。", en: "Four randomly distributed steam vents push nearby probes one cell. Placed objects remain intact and block movement. Covered vents do not erupt. Red hatching warns of an eruption but does not restrict movement; a white rim marks a currently covered vent. SHIELD blocks steam pushes." },
  orbit: { icon: "↻", ja: "CORE直近を除く、隣り合わない2つのリングが、互いに逆方向へ90度回転。探査機も配置物も一緒に移動します。", en: "Two nonadjacent rings, excluding the innermost ring, rotate 90 degrees in opposite directions, carrying probes and placed objects." },
  gravity: { icon: "◎", ja: "COREから3マス以上離れた、2巡前に予告された重力中心へ引き寄せます。中心から2マス以内は最大2マス、3〜5マスは1マス。斜めも対象で、中心やCOREに到達すると停止。機体や障害物は飛び越えません。配置物は動きません。発動時にPULSE範囲内の機体は引かれません。", en: "Pulls probes toward a random center at least 3 cells from CORE, announced two rounds ahead. Within 2 cells: up to 2 steps; within 3–5 cells: 1 step, including diagonally. Stops at the center or CORE, or before obstacles and other probes. Placed objects stay put. Probes inside a PULSE field at activation resist the pull." },
  wind: { icon: "➜", ja: "8方向から選ばれた方向へ、すべての探査機を最大2マス押します。COREに到達すると停止します。メテオは動かず、他の探査機や障害物があれば止まります。SHIELDは移動を1マス軽減します。", en: "Pushes all probes up to two cells in one of eight directions, stopping at CORE. Meteors stay put; probes and obstacles block movement. SHIELD reduces the push by one cell." },
} as const;

/** Visual urgency only; never changes event timing or game rules. */
export const MATCH_EVENT_FORECAST = {
  baseOpacity: .48,
  urgencyGain: .42,
  secondaryScale: .78,
  staggerMs: 550,
};
/** Stored rooms and AI forecasts use the same order without mutating saved arrays. */
export function orderMatchEvents<T extends { kind: MatchEventKind }>(events: readonly T[]): T[] {
  return [...events].sort((a, b) => MATCH_EVENT_ORDER.indexOf(a.kind) - MATCH_EVENT_ORDER.indexOf(b.kind));
}
/** Shared explanation for combined events in setup, manual and match details. */
export const MATCH_EVENT_CHAIN = {
  ja: "前のイベントで動いた後の位置から、次の効果を判定します。噴出口の白い縁は現在の状態で、先の移動・回転により変わります。途中でCOREに到達した場合、後続のイベントは発動しません。",
  en: "Each effect uses the positions left by the previous event. White vent rims show current cover, which earlier movement or rotation can change. Reaching CORE stops the remaining events.",
} as const;
