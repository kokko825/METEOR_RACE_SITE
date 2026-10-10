import { MATCH_EVENT_CHAIN, MATCH_EVENT_RULES, MATCH_EVENT_FORECAST, MATCH_EVENT_INFO, MATCH_EVENT_LORE, MATCH_EVENTS, MATCH_EVENT_FX, MATCH_EVENT_ORDER, normalizeMatchEvents, type EventIntervals, type MatchEventKind } from "../../config/match-events";
import type { CSSProperties } from "react";
import { boardToViewDelta, distance, samePos, type MatchEventState, type Pos } from "../game-rules";
export const eventFxStyle = { "--event-lead": `${MATCH_EVENT_FX.leadMs}ms`, "--event-move": `${MATCH_EVENT_FX.moveMs}ms`, "--event-heartbeat": `${MATCH_EVENT_FX.heartbeatMs}ms` } as CSSProperties;
/** Independent countdowns sort first; stable ties retain the actual resolution order. */
export function upcomingEvents(event: MatchEventState) {
  return normalizeMatchEvents(event.kinds ?? [event.kind]).sort((a, b) =>
    (event.schedule?.[a]?.remaining ?? event.remaining) - (event.schedule?.[b]?.remaining ?? event.remaining));
}
export function forecastStyle(event: MatchEventState | undefined, players: number): CSSProperties {
  if (!event || event.kind === "off") return {};
  const progress = Math.min(.95, (event.acted?.length ?? 0) / Math.max(1, players));
  return Object.fromEntries(upcomingEvents(event).flatMap((kind, index) => {
    const remaining = event.schedule?.[kind]?.remaining ?? event.remaining;
    const urgency = Math.max(0, Math.min(1, (MATCH_EVENT_RULES.warningRounds - remaining + progress) / MATCH_EVENT_RULES.warningRounds));
    return [[`--${kind}-strength`, (MATCH_EVENT_FORECAST.baseOpacity + urgency * MATCH_EVENT_FORECAST.urgencyGain) * (index === 0 ? 1 : MATCH_EVENT_FORECAST.secondaryScale)],
      [`--${kind}-delay`, `${-index * MATCH_EVENT_FORECAST.staggerMs}ms`]];
  })) as CSSProperties;
}
export function EventLabel({ kind, language }: { kind: MatchEventKind; language: "ja" | "en" }) {
  return <span className={`event-label event-color-${kind}`}><i aria-hidden="true">{MATCH_EVENT_INFO[kind].icon}</i><span>{MATCH_EVENTS[kind][language]}</span></span>;
}
export function EventExplanation({ kind, language }: { kind: MatchEventKind; language: "ja" | "en" }) {
  return <article className="event-explanation"><b><EventLabel kind={kind} language={language} /></b><p>{MATCH_EVENT_INFO[kind][language]}</p></article>;
}
export function EventOrder({ language, kinds = MATCH_EVENT_ORDER, active }: { language: "ja" | "en"; kinds?: MatchEventKind[]; active?: MatchEventKind }) {
  return <div className="event-order"><small>{language === "ja" ? "同時発動の順番" : "Simultaneous resolution order"}</small><ol>{normalizeMatchEvents(kinds).map((kind) => <li key={kind} aria-current={active === kind ? "step" : undefined}><EventLabel kind={kind} language={language} /></li>)}</ol>{normalizeMatchEvents(kinds).length > 1 && <p className="event-chain-note">{MATCH_EVENT_CHAIN[language]}</p>}</div>;
}
export function EventBoardEffect({ event, perspective, firing }: { event?: MatchEventState; perspective: number; firing: boolean }) {
  if (!firing && event?.forecasts) return <>{event.forecasts.map((forecast) => <EventBoardEffect key={forecast.kind} event={{ ...event, kind: forecast.kind, forecast, forecasts: undefined }} perspective={perspective} firing={false} />)}</>;
  const f = firing ? event?.last : event?.forecast;
  if (!f || (f.kind !== "gravity" && f.kind !== "wind")) return null;
  const d = boardToViewDelta({ r: f.dr, c: f.dc }, perspective);
  return <div aria-hidden="true" className={`event-board-effect ${f.kind} ${firing ? "firing" : "forecast"}`} style={{ "--wind-angle": `${Math.atan2(d.r, d.c) * 180 / Math.PI}deg` } as CSSProperties}>
    {f.kind === "gravity" ? <><i className="gravity-halo" /><i className="gravity-accretion" /><i className="gravity-core" /></> : <div className="wind-bearing"><i className="wind-arrow" />{firing && <div className="wind-dust"><i className="dust-cloud" />{Array.from({ length: 18 }, (_, i) => <i className="dust-streak" key={i} style={{ "--dust-y": `${(i * 37 + 7) % 100}%`, "--dust-delay": `${-(i % 6) * 90}ms`, "--dust-length": `${12 + i % 5 * 5}%` } as CSSProperties} />)}</div>}</div>}
  </div>;
}

export function EventControls({ value, onChange, language, interval, onIntervalChange }: { value: MatchEventKind[]; onChange: (value: MatchEventKind[]) => void; language: "ja" | "en"; interval: EventIntervals; onIntervalChange: (value: EventIntervals) => void }) {
  return <fieldset className="event-controls">
    <legend>{language === "ja" ? "盤面イベント" : "Field events"}</legend>
    <p className="event-intro">{MATCH_EVENT_LORE[language]}</p>
    <div className="event-toggle-grid">
      {MATCH_EVENT_ORDER.map((kind) => <button type="button" key={kind} aria-pressed={value.includes(kind)}
        title={MATCH_EVENT_INFO[kind][language]}
        onClick={() => onChange(normalizeMatchEvents(value.includes(kind) ? value.filter((v) => v !== kind) : [...value, kind]))}>
        <EventLabel kind={kind} language={language} /><b>{value.includes(kind) ? "ON" : "OFF"}</b>
      </button>)}
    </div>
    <div className="event-options">
      {normalizeMatchEvents(value).map((kind) => <label key={kind}>{MATCH_EVENTS[kind][language]} {language === "ja" ? "周期（巡）" : "(rounds)"}<select aria-label={`${MATCH_EVENTS[kind][language]} ${language === "ja" ? "発動周期" : "interval"}`} value={interval[kind] ?? 5} onChange={(e) => onIntervalChange({ ...interval, [kind]: Number(e.target.value) })}>{Array.from({ length: 97 }, (_, i) => <option key={i + 3} value={i + 3}>{i + 3}</option>)}</select></label>)}
      <small>{language === "ja" ? "複数選択可 · ワープ以外は2巡前に予告" : "Combine events · 2-round warning except warp"}</small>
    </div>
    <details className="event-help"><summary>{language === "ja" ? "イベントの効果と発動順" : "Effects and resolution order"}</summary><EventOrder language={language} /><div>{MATCH_EVENT_ORDER.map((kind) => <EventExplanation key={kind} kind={kind} language={language} />)}</div></details>
  </fieldset>;
}

/** Keep telemetry to one line; schedules remain available on demand. */
export function EventSummary({ event, language, perspective = 0, firing = false }: { event?: MatchEventState; language: "ja" | "en"; perspective?: number; firing?: boolean }) {
  if (!event || event.kind === "off") return null;
  return <details className="event-summary-menu">
    <summary>{firing ? (language === "ja" ? `${MATCH_EVENTS[event.last?.kind ?? event.kind].ja} 発動中` : `${MATCH_EVENTS[event.last?.kind ?? event.kind].en} ACTIVE`) : language === "ja" ? `イベント あと${event.remaining}巡` : `Event in ${event.remaining} rounds`}</summary>
    <div className="event-summary-popover"><EventStatus event={event} language={language} perspective={perspective} firing={firing} />{(event.kinds?.length ?? 1) > 1 && <EventOrder language={language} kinds={firing && event.stages?.length ? event.stages.map(stage => stage.forecast.kind) : event.kinds} active={firing ? event.last?.kind : undefined} />}</div>
  </details>;
}

export function EventStatus({ event, language, perspective = 0, firing = false, compact = false }: { event?: MatchEventState; language: "ja" | "en"; perspective?: number; firing?: boolean; compact?: boolean }) {
  if (!event || event.kind === "off") return null;
  if (!firing && (event.kinds?.length ?? 0) > 1) return <div className="event-sequence" role="status"><b>{language === "ja" ? `イベントまで${event.remaining}巡` : `Events in ${event.remaining} rounds`}</b><div>{upcomingEvents(event).map((kind) => <span key={kind}><EventStatus event={{ ...event, kinds: undefined, kind, remaining: event.schedule?.[kind]?.remaining ?? event.remaining, forecast: event.forecasts?.find((f) => f.kind === kind) }} language={language} perspective={perspective} /></span>)}</div></div>;
  const forecast = firing ? event.last : event.kind === "warp" ? undefined : event.forecast;
  const kind = firing ? event.last?.kind ?? event.kind : event.kind;
  const delta = forecast ? boardToViewDelta({ r: forecast.dr, c: forecast.dc }, perspective) : null;
  const arrow = delta ? [["↖", "↑", "↗"], ["←", "", "→"], ["↙", "↓", "↘"]][Math.sign(delta.r) + 1][Math.sign(delta.c) + 1] : "";
  return <span className={`event-status${forecast ? " announced" : ""}`}>
    <b><EventLabel kind={kind} language={language} />{compact ? "" : " · "}{compact ? "" : firing ? (language === "ja" ? "発動" : "ACTIVE") : language === "ja" ? `あと${event.remaining}巡` : `${event.remaining} rounds`}</b>
    {forecast ? <small>{kind === "wind" ? arrow : kind === "orbit" ? `${language === "ja" ? "中央から" : "Ring"} ${forecast.ring}${forecast.clockwise ? "↻" : "↺"}${forecast.secondRing ? ` / ${forecast.secondRing}${forecast.clockwise ? "↺" : "↻"}` : ""} 90°`
      : kind === "geyser" ? (language === "ja" ? "噴出口 ×4" : "4 vents")
      : kind === "warp" ? (language === "ja" ? "接続先を更新" : "Gates relocate")
      : "→ CORE"}</small> : null}
  </span>;
}

/** Decorative only: never intercept board input, including during forecasts. */
export function EventCellEffect({ event, pos, mid, perspective, firing }: { event?: MatchEventState; pos: Pos; mid: number; perspective: number; firing: boolean }) {
  if (!firing && event?.forecasts) return <>{event.forecasts.map((forecast) => <EventCellEffect key={forecast.kind} event={{ ...event, forecast, forecasts: undefined }} pos={pos} mid={mid} perspective={perspective} firing={false} />)}</>;
  const f = firing ? event?.last : event?.forecast;
  if (!f) return null;
  const arrow = (dr: number, dc: number) => { const d = boardToViewDelta({ r: dr, c: dc }, perspective); return d.r < 0 ? "↑" : d.r > 0 ? "↓" : d.c > 0 ? "→" : "←"; };
  if (f.kind === "geyser" && (f.vents ?? [f.target]).some((v) => samePos(v, pos))) return <svg aria-hidden="true" className="event-vent-crack" viewBox="0 0 100 100">
    <path className="crack-void" d="M0 0H100V100H0Z" />
    <path className="crack-slab slab-a" d="M0 0H42L38 22 49 39 42 48 26 40 12 45 0 34Z" />
    <path className="crack-slab slab-b" d="M48 0H100V35L78 46 61 41 52 47 55 38 44 21Z" />
    <path className="crack-slab slab-c" d="M0 41 12 51 26 47 44 55 36 73 44 100H0Z" />
    <path className="crack-slab slab-d" d="M100 42V100H51L44 73 52 55 63 49 79 53Z" />
    <path className="crack-rim" d="M0 34 12 45 26 40 42 48 49 39 38 22 42 0 M100 35 78 46 61 41 52 47 M0 41 12 51 26 47 44 55 36 73 44 100 M100 42 79 53 63 49 52 55 44 73 51 100" />
  </svg>;
  const ring = Math.max(Math.abs(pos.r - mid), Math.abs(pos.c - mid));
  if (f.kind === "orbit" && (ring === f.ring || ring === f.secondRing) && (pos.r === mid || pos.c === mid)) {
    const sign = (f.clockwise ? 1 : -1) * (ring === f.ring ? 1 : -1);
    return <span aria-hidden="true" className={`event-direction orbit${firing ? " firing" : ""}`}>{arrow(Math.sign(pos.c - mid) * sign, -Math.sign(pos.r - mid) * sign)}</span>;
  }
  return null;
}

export function eventCellClass(event: MatchEventState | undefined, pos: Pos, mid: number, occupied: readonly Pos[] = []): string {
  if (event?.forecasts) return event.forecasts.map((forecast) => eventCellClass({ ...event, forecast, forecasts: undefined }, pos, mid, occupied)).filter(Boolean).join(" ");
  const f = event?.forecast;
  if (!f) return "";
  if (f.kind === "geyser") {
    const vents = f.vents ?? [f.target];
    const covered = (vent: Pos) => occupied.some((p) => samePos(p, vent));
    const vent = vents.find((v) => samePos(pos, v));
    if (vent) return `event-vent ${covered(vent) ? "event-vent-blocked" : "event-vent-warning"}`;
    const nearby = vents.filter((v) => distance(pos, v) === 1);
    if (nearby.length) return `event-range event-geyser-range ${nearby.some((v) => !covered(v)) ? "event-geyser-warning" : "event-geyser-blocked"}`;
    return "";
  }
  if (f.kind === "orbit" && [f.ring, f.secondRing].includes(Math.max(Math.abs(pos.r - mid), Math.abs(pos.c - mid)))) return "event-range event-orbit-tile";
  if (f.kind === "gravity" && pos.r === mid && pos.c === mid) return "event-gravity-core";
  return "";
}
