import { useEffect, useMemo, useState } from "react";
import { MATCH_EVENT_FX } from "../../config/match-events";
import type { GameState } from "../game-rules";

/** Commit the animation before paint so the destination cannot flash first. */
export function useFieldEvent(liveGame: GameState) {
  const serial = liveGame.matchEvent?.serial ?? 0;
  const [completed, setCompleted] = useState(0);
  const [cursor, setCursor] = useState({ serial: 0, index: 0 });
  if (serial < completed) setCompleted(serial);
  if (serial < cursor.serial) setCursor({ serial, index: 0 });
  const firing = serial > completed;
  const index = cursor.serial === serial ? cursor.index : 0;
  const count = liveGame.matchEvent?.stages?.length ?? 1;
  useEffect(() => {
    if (!firing) return;
    const timer = window.setTimeout(() => {
      if (index + 1 < count) setCursor({ serial, index: index + 1 });
      else setCompleted(serial);
    }, MATCH_EVENT_FX.leadMs + MATCH_EVENT_FX.moveMs + MATCH_EVENT_FX.settleMs);
    return () => window.clearTimeout(timer);
  }, [serial, firing, index, count]);
  const game = useMemo(() => {
    const event = liveGame.matchEvent;
    const stage = firing ? event?.stages?.[index] : undefined;
    return stage && event ? { ...liveGame, ...stage.after, matchEvent: { ...event, kind: stage.forecast.kind, last: stage.forecast, from: stage.before.probes } } : liveGame;
  }, [liveGame, firing, index]);
  return { firing, game, effectKey: `${serial}-${index}` };
}
