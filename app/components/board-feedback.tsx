import { useEffect, useState, type CSSProperties } from "react";
import { BATTLE_EFFECTS } from "../../config/battle-effects";
import { activePlayers, activePulseDevices, boardToViewDelta, samePos, type GameState, type Pos } from "../game-rules";
import { DEFAULT_BALANCE } from "../balance-config";

type Cue = { pos: Pos; kind: "break" | "return" | "print" | "dissolve" | "boost"; delta?: Pos };

/** State-difference receipts also work for remote players; never change game state. */
export function boardFeedbackBetween(before: GameState, after: GameState): Cue[] {
  if (before.size !== after.size || after.turnCount < before.turnCount || before.phase === "setup" || after.phase === "setup") return [];
  const cues: Cue[] = [];
  const meteorIds = new Set(after.meteors.map(m => m.id));
  const beforeHoloIds = new Set(before.obstacles.map(m => m.id));
  const afterHoloIds = new Set(after.obstacles.map(m => m.id));
  for (const meteor of before.meteors) {
    if (!meteorIds.has(meteor.id)) {
      const owner = after.probes[meteor.owner];
      cues.push({ pos: meteor, kind: "break" });
      if (!meteor.consumable) cues.push({ pos: meteor, kind: "return", delta: { r: owner.r - meteor.r, c: owner.c - meteor.c } });
    }
  }
  for (const holo of before.obstacles) {
    if (!afterHoloIds.has(holo.id)) cues.push({ pos: holo, kind: "dissolve" });
  }
  for (const holo of after.obstacles) {
    if (!beforeHoloIds.has(holo.id)) cues.push({ pos: holo, kind: "print" });
  }
  for (const player of activePlayers(before)) {
    if ((after.boosterMoves[player] ?? 0) < (before.boosterMoves[player] ?? 0) && !samePos(before.probes[player], after.probes[player])) {
      cues.push({ pos: before.probes[player], kind: "boost", delta: { r: after.probes[player].r - before.probes[player].r, c: after.probes[player].c - before.probes[player].c } });
    }
  }
  return cues;
}

export function BoardFeedback({ game, perspective, enabled }: { game: GameState; perspective: number; enabled: boolean }) {
  const [previous, setPrevious] = useState(game);
  const [batch, setBatch] = useState({ serial: 0, cues: [] as Cue[] });
  if (previous !== game) {
    setPrevious(game);
    const cues = enabled ? boardFeedbackBetween(previous, game) : [];
    if (cues.length || !enabled || game.turnCount < previous.turnCount || game.size !== previous.size || game.phase === "setup") setBatch({ serial: batch.serial + 1, cues });
  }
  useEffect(() => {
    const timer = window.setTimeout(() => setBatch(current => current.serial === batch.serial ? { ...current, cues: [] } : current), BATTLE_EFFECTS.receiptMs);
    return () => window.clearTimeout(timer);
  }, [batch.serial]);
  const mid = (game.size - 1) / 2;
  const returns = enabled ? batch.cues.filter(cue => cue.kind === "return") : [];
  return <div className="board-feedback" aria-hidden="true">{activePulseDevices(game).map(device => {
    const pos = boardToViewDelta({ r: device.r - mid, c: device.c - mid }, perspective);
    const radius = game.balance?.pulseRadius ?? DEFAULT_BALANCE.pulseRadius;
    return <span key={`field-${device.id}`} className="pulse-perimeter" style={{
      left: `${(pos.c + mid - radius) / game.size * 100}%`, top: `${(pos.r + mid - radius) / game.size * 100}%`,
      width: `${(radius * 2 + 1) / game.size * 100}%`, height: `${(radius * 2 + 1) / game.size * 100}%`,
    }} />;
  })}{enabled && batch.cues.map((cue, i) => {
    const pos = boardToViewDelta({ r: cue.pos.r - mid, c: cue.pos.c - mid }, perspective);
    const delta = boardToViewDelta(cue.delta ?? { r: 0, c: 0 }, perspective);
    return <span key={`${batch.serial}-${i}`} className={`board-cue cue-${cue.kind}`} style={{
      left: `${(pos.c + mid) / game.size * 100}%`, top: `${(pos.r + mid) / game.size * 100}%`,
      width: `${100 / game.size}%`, height: `${100 / game.size}%`,
      "--cue-x": `${delta.c * 100}%`, "--cue-y": `${delta.r * 100}%`,
      "--cue-angle": `${Math.atan2(delta.r, delta.c) * 180 / Math.PI + 90}deg`,
    } as CSSProperties}>{cue.kind === "print" && <svg className="holo-blueprint" viewBox="0 0 100 100"><polygon points="50,0 88,17 100,55 76,91 35,100 4,72 8,28" /><path d="M8 28 50 48 88 17 M50 48 35 100 M50 48 100 55" /></svg>}{Array.from({ length: 6 }, (_, n) => <i key={n} style={{ "--piece": n, "--trail-step": n / 6 } as CSSProperties} />)}</span>;
  })}{returns.length > 0 && <svg className="recall-paths" viewBox={`0 0 ${game.size} ${game.size}`}>
    {returns.map((cue, i) => {
      const from = boardToViewDelta({ r: cue.pos.r - mid, c: cue.pos.c - mid }, perspective);
      const delta = boardToViewDelta(cue.delta ?? { r: 0, c: 0 }, perspective);
      const x = from.c + mid + .5, y = from.r + mid + .5;
      return <g key={`${batch.serial}-${i}`}><path pathLength="1" d={`M${x} ${y} L${x + delta.c} ${y + delta.r}`} /><circle cx={x + delta.c} cy={y + delta.r} r=".38" /></g>;
    })}
  </svg>}</div>;
}

export function EquipmentActivation({ kind }: { kind: string }) {
  if (kind === "booster") return <svg className="engine-meter" viewBox="0 0 180 100" aria-hidden="true" style={{ "--rev-duration": `${BATTLE_EFFECTS.itemMs * .45}ms` } as CSSProperties}>
    <g className="meter-flames">{[-2, -1, 0, 1, 2].map((n) => <g key={n} transform={`translate(${90 + n * 23} 77) scale(${n % 2 ? -.8 : .9} ${1 - Math.abs(n) * .13})`}>
      <path className="meter-flame" d="M-14 0C-26-24 2-35-7-64C16-52 12-36 18-30L23-43C38-14 17 4 0 5Z" />
      <path className="meter-flame-core" d="M-5 0C-13-13 5-24 4-37C18-22 17-10 6 2Z" />
    </g>)}</g>
    <path className="meter-housing" d="M19 81A71 71 0 0 1 161 81L151 89H29Z" />
    <path className="meter-track" d="M27 78A63 63 0 0 1 153 78" />
    <path className="meter-charge" pathLength="1" d="M27 78A63 63 0 0 1 153 78" />
    <path className="meter-redline" d="M135 34A63 63 0 0 1 153 78" />
    <g className="meter-ticks">{Array.from({ length: 13 }, (_, n) => <path key={n} d={n % 3 === 0 ? "M35 78H43" : "M35 78H39"} transform={`rotate(${n * 15} 90 78)`} />)}</g>
    <path className="meter-needle" d="M90 75 39 78 90 81 101 78Z" />
    <circle className="meter-hub" cx="90" cy="78" r="6" />
    <path className="meter-exhaust" d="M21 79 7 74M22 85 4 88M159 79 173 74M158 85 176 88" />
  </svg>;
  if (kind === "shield") return <div className="shield-deploy" aria-hidden="true">{Array.from({ length: 25 }, (_, i) => <i key={i} style={{ "--hex-delay": `${(Math.abs(i % 5 - 2) + Math.abs(Math.floor(i / 5) - 2)) * 75}ms` } as CSSProperties} />)}</div>;
  return null;
}
