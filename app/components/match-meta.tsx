import type { ReactNode } from "react";
import { activePlayers, isTeamVariant, teamOf, type Player, type GameState } from "../game-rules";

// A positional estimate, not a calibrated probability. Only public board state is used.
export function raceShares(game: GameState) {
  const core = Math.floor(game.size / 2);
  const side = (p: Player): Player => !isTeamVariant(game.variant) ? p : teamOf(p) === "sun" ? "red" : "blue";
  const weights = new Map<Player, number>();
  const roster = [...new Set([...(game.finishOrder ?? []), ...activePlayers(game)])];
  const first = game.finishOrder?.[0] ?? game.winner;
  for (const p of roster) {
    const {r,c} = game.probes[p];
    const steps = Math.abs(r-core) + Math.abs(c-core);
    const stock = game.inventory[p];
    const support = Math.min(2,stock.small)*0.12 + Math.min(1,stock.large)*0.28 + (game.shield[p]?0.18:0) + (game.boosterMoves[p]>0?0.3:0);
    const score = first && first !== "draw" ? Number(side(p) === side(first)) : Math.exp(-0.37*steps + support);
    weights.set(side(p), Math.max(weights.get(side(p)) ?? 0, score));
  }
  const total = [...weights.values()].reduce((a,b)=>a+b,0);
  const shares = [...weights].map(([player,w])=>({player, value:100*w/total}));
  const points = shares.map(s=>Math.floor(s.value));
  const remainder = 100-points.reduce((a,b)=>a+b,0);
  shares.map((s,i)=>({i,f:s.value-points[i]})).sort((a,b)=>b.f-a.f).slice(0,remainder).forEach(({i})=>points[i]++);
  return shares.map(({player},i)=>({player,percent:points[i]}));
}

type Props = {game:GameState; language:"ja"|"en"; roundLabel:string; roundNumber:number; rankedDetails?:ReactNode; eventDetails?:ReactNode};
export function MatchMeta({game,language,roundLabel,roundNumber,rankedDetails,eventDetails}:Props) {
  const ja = language === "ja";
  const tied = game.winner === "draw";
  const settled = Boolean(game.finishOrder?.length || game.winner);
  const shares = raceShares(game);
  return <>
    <div className="match-meta"><div className="round">{roundLabel} {roundNumber}{rankedDetails}</div>{eventDetails}</div>
    {game.phase !== "setup" && <section className="race-readout" aria-label={ja?"AEQRIS 形勢評価":"AEQRIS race evaluation"}>
      <div className="race-caption"><b>AEQRIS</b><span>{tied ? (ja?"引き分け":"Draw") : settled ? (ja?"勝者確定":"Winner confirmed") : (ja?"推定勝率":"Win estimate")}</span></div>
      {!tied && <div className="race-meter">
        <div className="race-rail" aria-hidden="true">{shares.map(s=><i key={s.player} data-side={s.player} style={{width:s.percent+"%"}} />)}</div>
        <div className="race-values">{shares.map(s=><span key={s.player} data-side={s.player}>{s.player.toUpperCase()} <b>{s.percent}%</b></span>)}</div>
      </div>}
    </section>}
  </>;
}
