import { MATCH_EVENTS, type MatchEventKind } from "../../config/match-events";
import type { CSSProperties } from "react";
import { boardToViewDelta, distance, samePos, type MatchEventState, type Pos } from "../game-rules";

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
    {forecast ? <small>{event.kind === "wind" ? arrow : event.kind === "orbit" ? `${language === "ja" ? "中央から" : "Ring"} ${forecast.ring} · ${forecast.clockwise ? "↻" : "↺"} 90°`
      : event.kind === "geyser" ? (language === "ja" ? "噴出口 ×4" : "4 vents")
      : "→ CORE"}</small> : null}
  </span>;
}

/** Decorative only: never intercept board input, including during forecasts. */
export function EventCellEffect({ event, pos, mid, perspective, firing }: { event?: MatchEventState; pos: Pos; mid: number; perspective: number; firing: boolean }) {
  const f = firing ? event?.last : event?.forecast;
  if (!f) return null;
  const arrow = (dr: number, dc: number) => { const d = boardToViewDelta({ r: dr, c: dc }, perspective); return d.r < 0 ? "↑" : d.r > 0 ? "↓" : d.c > 0 ? "→" : "←"; };
  if (f.kind === "geyser" && (f.vents ?? [f.target]).some((v) => samePos(v, pos))) return <span aria-hidden="true" className="event-vent-mound"><i /><i /><i /></span>;
  if (f.kind === "orbit" && Math.max(Math.abs(pos.r - mid), Math.abs(pos.c - mid)) === f.ring && (pos.r === mid || pos.c === mid)) {
    const sign = f.clockwise ? 1 : -1;
    return <span aria-hidden="true" className={`event-direction orbit${firing ? " firing" : ""}`}>{arrow(Math.sign(pos.c - mid) * sign, -Math.sign(pos.r - mid) * sign)}</span>;
  }
  if (f.kind === "wind") {
    const edge = f.dc > 0 ? pos.c === 0 : f.dc < 0 ? pos.c === mid * 2 : f.dr > 0 ? pos.r === 0 : pos.r === mid * 2;
    if (!edge && !firing) return null;
    const d = boardToViewDelta({ r: f.dr, c: f.dc }, perspective);
    return <span aria-hidden="true" className={`event-direction wind${firing ? " firing" : ""}`} style={{ "--wind-x": `${d.c * 200}%`, "--wind-y": `${d.r * 200}%` } as CSSProperties}>{arrow(f.dr, f.dc)}</span>;
  }
  if (f.kind === "gravity" && firing) {
    const d = boardToViewDelta({ r: mid - pos.r, c: mid - pos.c }, perspective);
    return <span aria-hidden="true" className="event-gravity-stream" style={{ "--gravity-x": `${d.c * 100}%`, "--gravity-y": `${d.r * 100}%` } as CSSProperties} />;
  }
  return null;
}

export function eventCellClass(event: MatchEventState | undefined, pos: Pos, mid: number): string {
  const f = event?.forecast;
  if (!f) return "";
  if (f.kind === "geyser") return (f.vents ?? [f.target]).some((v) => samePos(pos, v)) ? "event-vent" : (f.vents ?? [f.target]).some((v) => distance(pos, v) === 1) ? "event-range" : "";
  if (f.kind === "orbit" && Math.max(Math.abs(pos.r - mid), Math.abs(pos.c - mid)) === f.ring) return "event-range";
  if (f.kind === "gravity" && pos.r === mid && pos.c === mid) return "event-range";
  return "";
}
