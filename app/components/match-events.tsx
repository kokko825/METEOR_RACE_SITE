import { MATCH_EVENTS, MATCH_EVENT_FX, type MatchEventKind } from "../../config/match-events";
import type { CSSProperties } from "react";
import { boardToViewDelta, distance, samePos, type MatchEventState, type Pos } from "../game-rules";
export const eventFxStyle = { "--event-lead": `${MATCH_EVENT_FX.leadMs}ms`, "--event-move": `${MATCH_EVENT_FX.moveMs}ms`, "--event-heartbeat": `${MATCH_EVENT_FX.heartbeatMs}ms` } as CSSProperties;
export function EventBoardEffect({ event, perspective, firing }: { event?: MatchEventState; perspective: number; firing: boolean }) {
  const f = firing ? event?.last : event?.forecast;
  if (!f || (f.kind !== "gravity" && f.kind !== "wind")) return null;
  const d = boardToViewDelta({ r: f.dr, c: f.dc }, perspective);
  return <div aria-hidden="true" className={`event-board-effect ${f.kind} ${firing ? "firing" : "forecast"}`} style={{ "--wind-angle": `${Math.atan2(d.r, d.c) * 180 / Math.PI}deg` } as CSSProperties}>
    {f.kind === "gravity" ? <><i className="gravity-halo" /><i className="gravity-core" /></> : <div className="wind-bearing"><i className="wind-arrow" /></div>}
  </div>;
}

export function EventControls({ value, onChange, language }: { value: MatchEventKind; onChange: (value: MatchEventKind) => void; language: "ja" | "en" }) {
  return <label className="event-controls">{language === "ja" ? "盤面イベント" : "Field event"}
    <select aria-label={language === "ja" ? "盤面イベント" : "Field event"} value={value} onChange={(e) => onChange(e.target.value as MatchEventKind)}>
      {Object.entries(MATCH_EVENTS).map(([kind, label]) => <option key={kind} value={kind}>{label[language]}</option>)}
    </select>
    <small>{language === "ja" ? "5巡ごとに発動・2巡前に予告" : "Every 5 rounds · 2-round warning"}</small>
  </label>;
}

export function EventStatus({ event, language, perspective = 0, firing = false }: { event?: MatchEventState; language: "ja" | "en"; perspective?: number; firing?: boolean }) {
  if (!event || event.kind === "off") return null;
  const forecast = event.forecast ?? (firing ? event.last : undefined);
  const delta = forecast ? boardToViewDelta({ r: forecast.dr, c: forecast.dc }, perspective) : null;
  const arrow = delta ? delta.r < 0 ? "↑" : delta.r > 0 ? "↓" : delta.c > 0 ? "→" : "←" : "";
  return <span className={`event-status${forecast ? " announced" : ""}`} role="status">
    <b>{MATCH_EVENTS[event.kind][language]} · {firing ? (language === "ja" ? "発動" : "ACTIVE") : language === "ja" ? `あと${event.remaining}巡` : `${event.remaining} rounds`}</b>
    {forecast ? <small>{event.kind === "wind" ? arrow : event.kind === "orbit" ? `${language === "ja" ? "中央から" : "Ring"} ${forecast.ring}${forecast.clockwise ? "↻" : "↺"}${forecast.secondRing ? ` / ${forecast.secondRing}${forecast.clockwise ? "↺" : "↻"}` : ""} 90°`
      : event.kind === "geyser" ? (language === "ja" ? "噴出口 ×4" : "4 vents")
      : "→ CORE"}</small> : null}
  </span>;
}

/** Decorative only: never intercept board input, including during forecasts. */
export function EventCellEffect({ event, pos, mid, perspective, firing }: { event?: MatchEventState; pos: Pos; mid: number; perspective: number; firing: boolean }) {
  const f = firing ? event?.last : event?.forecast;
  if (!f) return null;
  const arrow = (dr: number, dc: number) => { const d = boardToViewDelta({ r: dr, c: dc }, perspective); return d.r < 0 ? "↑" : d.r > 0 ? "↓" : d.c > 0 ? "→" : "←"; };
  if (f.kind === "geyser" && (f.vents ?? [f.target]).some((v) => samePos(v, pos))) return <svg aria-hidden="true" className="event-vent-crack" viewBox="0 0 100 100"><path d="M12 21 37 39 46 33 52 51 75 39 91 42 M52 51 40 66 45 87 M40 66 18 70 M52 51 66 68 83 77 M37 39 33 16" /></svg>;
  const ring = Math.max(Math.abs(pos.r - mid), Math.abs(pos.c - mid));
  if (f.kind === "orbit" && (ring === f.ring || ring === f.secondRing) && (pos.r === mid || pos.c === mid)) {
    const sign = (f.clockwise ? 1 : -1) * (ring === f.ring ? 1 : -1);
    return <span aria-hidden="true" className={`event-direction orbit${firing ? " firing" : ""}`}>{arrow(Math.sign(pos.c - mid) * sign, -Math.sign(pos.r - mid) * sign)}</span>;
  }
  return null;
}

export function eventCellClass(event: MatchEventState | undefined, pos: Pos, mid: number): string {
  const f = event?.forecast;
  if (!f) return "";
  if (f.kind === "geyser") return (f.vents ?? [f.target]).some((v) => samePos(pos, v)) ? "event-vent" : (f.vents ?? [f.target]).some((v) => distance(pos, v) === 1) ? "event-range" : "";
  if (f.kind === "orbit" && [f.ring, f.secondRing].includes(Math.max(Math.abs(pos.r - mid), Math.abs(pos.c - mid)))) return "event-range";
  if (f.kind === "gravity" && pos.r === mid && pos.c === mid) return "event-gravity-core";
  return "";
}
