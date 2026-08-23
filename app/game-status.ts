import type { SiteLanguage } from "./hooks/use-local-settings";
import { playerName, type GameState } from "./game-rules";
import { uiFormat, uiText } from "./i18n";

/** Converts rule-engine state into display copy without putting language into online state. */
export function gameStatusText(state: GameState, language: SiteLanguage) {
  if (language === "ja") return state.message;
  if (state.phase === "over") {
    if (state.winner === "draw" || state.winner === null) return uiText(language, "statusDraw");
    return uiFormat(language, "statusWinner", { player: playerName(state.winner) });
  }
  const player = playerName(state.turn);
  if (state.phase === "setup") return uiFormat(language, "statusSetup", { player });
  if (state.phase === "move") return uiFormat(language, "statusMove", { player });
  if (state.phase === "place") return uiFormat(language, "statusPlace", { player });
  const kind = state.pendingSwitches?.[0]?.kind.toUpperCase() ?? "ITEM";
  return uiFormat(language, "statusSwitch", { player, kind });
}
