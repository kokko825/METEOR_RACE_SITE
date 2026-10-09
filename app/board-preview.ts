import { applyMove, applyMeteor, applyBlastSwitch, applyHoloSwitch, applyPulseSwitch, type GameState, type Pos } from "./game-rules";

/** Uses the actual rules, without committing state, sound or online actions. */
export function boardTargetPreview(state: GameState, target: Pos): GameState | null {
  try {
    if (state.phase === "move") return applyMove(state, target);
    if (state.phase === "place" && state.selected !== "obstacle") return applyMeteor(state, target, state.selected === "capsule" ? "small" : state.selected, state.selected === "capsule").state;
    if (state.phase === "switch") {
      switch (state.pendingSwitches?.[0]?.kind) {
        case "blast": return applyBlastSwitch(state, target);
        case "holo": return applyHoloSwitch(state, target);
        case "pulse": return applyPulseSwitch(state, target);
      }
    }
  } catch { /* Invalid targets never commit or display a predicted result. */ }
  return null;
}
