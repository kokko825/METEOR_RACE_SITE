import { MATCH_EVENTS, MATCH_EVENT_RULES, type MatchEventKind } from "../../config/match-events";
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
      : event.kind === "geyser" ? (language === "ja" ? "光る噴出口から爆風。上に機体・配置物があると不発" : "Highlighted vent: covered vents do not erupt")
      : language === "ja" ? "機体のみ中央へ。配置物・他機は通り抜け不可" : "Probes inward; objects and other probes block movement"}</small>
      : <small>{language === "ja" ? `発動${MATCH_EVENT_RULES.warningRounds}巡前に範囲・方向を表示` : "Target and direction revealed 2 rounds before activation"}</small>}
  </span>;
}

export function eventCellClass(event: MatchEventState | undefined, pos: Pos, mid: number): string {
  const f = event?.forecast;
  if (!f) return "";
  if (f.kind === "geyser") return (f.vents ?? [f.target]).some((v) => samePos(pos, v)) ? "event-vent" : (f.vents ?? [f.target]).some((v) => distance(pos, v) === 1) ? "event-range" : "";
  if (f.kind === "orbit" && Math.max(Math.abs(pos.r - mid), Math.abs(pos.c - mid)) === f.ring) return "event-range";
  if (f.kind === "gravity" && pos.r === mid && pos.c === mid) return "event-range";
  return "";
}
