import { useEffect, useState, type CSSProperties } from "react";
import { BATTLE_EFFECTS } from "../../config/battle-effects";
import { activePlayers, activePulseDevices, boardToViewDelta, samePos, type GameState, type Pos } from "../game-rules";
import { DEFAULT_BALANCE } from "../balance-config";

type Cue = { pos: Pos; kind: "break" | "return" | "print" | "dissolve" | "boost"; delta?: Pos };

/** State-difference receipts also work for remote players; never change game state. */
export function boardFeedbackBetween(before: GameState, after: GameState): Cue[] {
  if (before.size !== after.size || after.turnCount < before.turnCount || before.phase === "setup" || after.phase === "setup") return [];
  const cues: Cue[] = [];
  for (const meteor of before.meteors) {
    if (!after.meteors.some(m => m.id === meteor.id)) {
      const owner = after.probes[meteor.owner];
      cues.push({ pos: meteor, kind: "break" });
      if (!meteor.consumable) cues.push({ pos: meteor, kind: "return", delta: { r: owner.r - meteor.r, c: owner.c - meteor.c } });
    }
  }
  for (const holo of before.obstacles) {
    if (!after.obstacles.some(m => m.id === holo.id)) cues.push({ pos: holo, kind: "dissolve" });
  }
  for (const holo of after.obstacles) {
    if (!before.obstacles.some(m => m.id === holo.id)) cues.push({ pos: holo, kind: "print" });
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
    if (cues.length || !enabled || game.turnCount < previous.turnCount) setBatch({ serial: batch.serial + 1, cues });
  }
  useEffect(() => {
    const timer = window.setTimeout(() => setBatch(current => current.serial === batch.serial ? { ...current, cues: [] } : current), BATTLE_EFFECTS.receiptMs);
    return () => window.clearTimeout(timer);
  }, [batch.serial]);
  const mid = (game.size - 1) / 2;
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
  })}{enabled && <svg className="recall-paths" viewBox={`0 0 ${game.size} ${game.size}`}>
    {batch.cues.filter(cue => cue.kind === "return").map((cue, i) => {
      const from = boardToViewDelta({ r: cue.pos.r - mid, c: cue.pos.c - mid }, perspective);
      const delta = boardToViewDelta(cue.delta ?? { r: 0, c: 0 }, perspective);
      const x = from.c + mid + .5, y = from.r + mid + .5;
      return <g key={`${batch.serial}-${i}`}><path pathLength="1" d={`M${x} ${y} L${x + delta.c} ${y + delta.r}`} /><circle cx={x + delta.c} cy={y + delta.r} r=".38" /></g>;
    })}
  </svg>}</div>;
}

export function EquipmentActivation({ kind }: { kind: string }) {
  if (kind === "booster") return <svg className="engine-meter" viewBox="0 0 120 70" aria-hidden="true"><path d="M10 60A50 50 0 0 1 110 60" /><path className="meter-redline" d="M94 23A50 50 0 0 1 110 60" /><path className="meter-needle" d="M60 60 18 55" /><circle cx="60" cy="60" r="5" /></svg>;
  if (kind === "shield") return <div className="shield-deploy" aria-hidden="true">{Array.from({ length: 25 }, (_, i) => <i key={i} style={{ "--hex-delay": `${(Math.abs(i % 5 - 2) + Math.abs(Math.floor(i / 5) - 2)) * 75}ms` } as CSSProperties} />)}</div>;
  return null;
}
