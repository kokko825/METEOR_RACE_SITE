import { useEffect, useMemo, useState } from "react";
import { MATCH_EVENT_FX } from "../../config/match-events";
import type { GameState } from "../game-rules";

/** Hold the before-board until the effect has played; then animate only this stage. */
export function useFieldEvent(liveGame: GameState, blocked = false) {
  const serial = liveGame.matchEvent?.serial ?? 0;
  const [completed, setCompleted] = useState(0);
  const [cursor, setCursor] = useState({ serial: 0, index: 0, moving: false });
  if (serial < completed) setCompleted(serial);
  if (serial < cursor.serial) setCursor({ serial, index: 0, moving: false });
  const pending = serial > completed;
  const firing = pending && !blocked;
  const index = cursor.serial === serial ? cursor.index : 0;
  const moving = firing && cursor.serial === serial && cursor.moving;
  const count = liveGame.matchEvent?.stages?.length ?? 1;
  useEffect(() => {
    if (!firing) return;
    const timer = window.setTimeout(() => {
      if (!moving) setCursor({ serial, index, moving: true });
      else if (index + 1 < count) setCursor({ serial, index: index + 1, moving: false });
      else setCompleted(serial);
    }, moving ? MATCH_EVENT_FX.moveMs + MATCH_EVENT_FX.settleMs : MATCH_EVENT_FX.leadMs);
    return () => window.clearTimeout(timer);
  }, [serial, firing, moving, index, count]);
  const game = useMemo(() => {
    const event = liveGame.matchEvent;
    const stage = pending ? event?.stages?.[index] : undefined;
    return stage && event ? { ...liveGame, ...(moving ? stage.after : stage.before),
      matchEvent: { ...event, kind: stage.forecast.kind, last: stage.forecast, from: stage.before.probes },
    } : liveGame;
  }, [liveGame, pending, moving, index]);
  return { firing, moving, game, effectKey: `${serial}-${index}` };
}
