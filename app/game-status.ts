import type { SiteLanguage } from "./hooks/use-local-settings";
import { isTeamVariant, isPulseLocked, teamName, playerName, type GameState } from "./game-rules";
import { uiFormat, uiText } from "./i18n";

/** Converts rule-engine state into display copy without putting language into online state. */
export function gameStatusText(state: GameState, language: SiteLanguage) {
  if (state.phase === "move" && isPulseLocked(state, state.turn)) return language === "ja"
    ? `${playerName(state.turn)}：PULSE範囲内のため移動できません。メテオ・アイテムで脱出できます。`
    : `${playerName(state.turn)}: PULSE prevents movement. Use a meteor or item to escape.`;
  if (state.phase === "move" && state.bonusMove) return language === "ja"
    ? `${playerName(state.turn)}：ボーナス移動${state.itemHands?.[state.turn]?.length ? " または アイテム" : ""}`
    : `${playerName(state.turn)}: Bonus move${state.itemHands?.[state.turn]?.length ? " or item" : ""}`;
  if (language === "ja") return state.message;
  if (state.phase === "over") {
    if (state.winner === "draw" || state.winner === null) return uiText(language, "statusDraw");
    if (isTeamVariant(state.variant)) return uiFormat(language, "statusTeamWinner", {
      player: playerName(state.winner),
      team: teamName(state.winner),
    });
    return uiFormat(language, "statusWinner", { player: playerName(state.winner) });
  }
  const player = playerName(state.turn);
  if (state.phase === "setup") return uiFormat(language, "statusSetup", { player });
  if (state.phase === "move") return uiFormat(language, "statusMove", { player });
  if (state.phase === "place") return uiFormat(language, "statusPlace", { player });
  const kind = state.pendingSwitches?.[0]?.kind.toUpperCase() ?? "ITEM";
  return uiFormat(language, "statusSwitch", { player, kind });
}
