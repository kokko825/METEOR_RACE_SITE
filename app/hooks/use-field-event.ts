import { useEffect, useState } from "react";
import { MATCH_EVENT_FX } from "../../config/match-events";

/** Commit the animation before paint so the destination cannot flash first. */
export function useFieldEvent(serial: number) {
  const [completed, setCompleted] = useState(0);
  if (serial < completed) setCompleted(serial);
  const firing = serial > completed;
  useEffect(() => {
    if (!firing) return;
    const timer = window.setTimeout(() => setCompleted(serial), MATCH_EVENT_FX.leadMs + MATCH_EVENT_FX.moveMs + MATCH_EVENT_FX.settleMs);
    return () => window.clearTimeout(timer);
  }, [serial, firing]);
  return firing;
}
