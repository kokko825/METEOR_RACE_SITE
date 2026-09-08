import type { CSSProperties } from "react";
import type { SiteLanguage } from "../hooks/use-local-settings";
import { ITEM_ICONS, SELECTABLE_ITEMS } from "../item-content";
import {
  teamOf,
  type ItemKind,
  type Meteor,
  type MeteorSize,
  type ObstacleMeteor,
  type Player,
  type Pos,
  type PulseDevice,
} from "../game-rules";

export const ITEM_DEMO_LABELS: Record<ItemKind, string> = {
  shield: "BLAST -1 CELL",
  booster: "METEOR JUMP",
  holo: "TEMPORARY BLOCK",
  orbit: "RING ROTATE 90° / 180°",
  blast: "AREA BLAST",
  pulse: "MOVE LOCK FIELD",
  recall: "ALL METEORS RETURN",
  gravity: "PULL TO CORE",
};

export function ItemIcon({ kind }: { kind: ItemKind }) {
  return <i className={`item-icon ${kind}`} aria-hidden="true">{ITEM_ICONS[kind]}</i>;
}

export function ProbeIcon({ color, teamMode = false }: { color: Player; teamMode?: boolean }) {
  const teamClass = teamMode ? ` team-${teamOf(color)}` : "";
  return <div className={`probe-portrait ${color}${teamClass}`}><span>▲</span><i /><b /></div>;
}

export function ProbeToken({
  player,
  rotation,
  push,
  teamMode = false,
  isSelf = false,
  shieldTurns = 0,
  boost = 0,
  settling = false,
  language = "ja",
}: {
  player: Player;
  rotation: number;
  push?: { from: Pos; dr: number; dc: number };
  teamMode?: boolean;
  isSelf?: boolean;
  shieldTurns?: number;
  boost?: number;
  settling?: boolean;
  language?: SiteLanguage;
}) {
  const pushStyle = push
    ? ({
        "--push-x": `${push.dc * 147}%`,
        "--push-y": `${push.dr * 147}%`,
        "--push-from-x": `${push.dc * -147}%`,
        "--push-from-y": `${push.dr * -147}%`,
      } as CSSProperties)
    : undefined;
  return (
    <span
      className={`probe-motion ${player}${teamMode ? ` team-${teamOf(player)}` : ""}${isSelf ? " is-self" : ""}${push ? settling ? " blast-settle" : " blast-lift" : ""}`}
      style={pushStyle}
    >
      {(shieldTurns > 0 || boost > 0) && (
        <span className="probe-effects" aria-label={`${shieldTurns > 0 ? `${language === "ja" ? "シールド" : "Shield"} ${shieldTurns} ` : ""}${boost > 0 ? `${language === "ja" ? "ブースト" : "Boost"} ${boost}` : ""}`}>
          {shieldTurns > 0 && <span className="shield-effect"><b>{shieldTurns}</b></span>}
          {boost > 0 && <span className="boost-effect"><i /><i /><b>{boost}</b></span>}
        </span>
      )}
      <span
        className={`probe-token ${player}${teamMode ? ` team-${teamOf(player)}` : ""}`}
        style={{ "--probe-rotation": `${rotation}deg` } as CSSProperties}
      >
        <i>▲</i>
      </span>
    </span>
  );
}

export function MeteorIcon({ meteor, falling = false, destroyed = false }: { meteor: Meteor; falling?: boolean; destroyed?: boolean }) {
  return (
    <span className={["meteor-token", meteor.owner, meteor.size, falling ? "meteor-fall" : "", destroyed ? `meteor-shatter return-${meteor.owner}` : ""].join(" ")}>
      {meteor.size === "large" ? "✦" : "●"}
      {destroyed && <i className="shard shard-a" />}
      {destroyed && <i className="shard shard-b" />}
      {destroyed && <i className="shard shard-c" />}
    </span>
  );
}

export function ObstacleIcon({ obstacle, roundsLeft, language = "ja" }: { obstacle: ObstacleMeteor; roundsLeft: number; language?: SiteLanguage }) {
  const roundsLabel = roundsLeft === -1 ? "∞" : String(roundsLeft);
  return (
    <span className={`obstacle-token ${obstacle.owner}`} title={language === "ja" ? (roundsLeft === -1 ? "破壊不能のホロメテオ・無制限" : `ホロメテオ・残り${roundsLeft}巡（爆風で短縮）`) : (roundsLeft === -1 ? "Indestructible holo meteor · unlimited" : `Holo meteor · ${roundsLeft} rounds left (reduced by blasts)`)}>
      <i /><b>{roundsLabel}</b><small>{language === "ja" ? "巡" : "R"}</small>
    </span>
  );
}

export function PulseDeviceIcon({ device, roundsLeft, language = "ja" }: { device: PulseDevice; roundsLeft: number; language?: SiteLanguage }) {
  return <span className={`pulse-device ${device.owner}`} title={language === "ja" ? `PULSE発生装置・残り${roundsLeft}巡` : `PULSE device · ${roundsLeft} rounds left`}><i /><b>PULSE</b><small>{roundsLeft}</small></span>;
}

export function InventoryPanel({ inventory, color, items, loadoutHidden = false, language = "ja" }: {
  inventory: Record<MeteorSize, number>;
  color: Player;
  items: ItemKind[];
  loadoutHidden?: boolean;
  language?: SiteLanguage;
}) {
  const itemCounts = SELECTABLE_ITEMS
    .map((kind) => ({ kind, count: items.filter((item) => item === kind).length }))
    .filter(({ count }) => count > 0);
  return (
    <div className="inventory">
      <span>{language === "ja" ? "ARSENAL / 所持メテオ" : "ARSENAL / METEORS"}</span>
      <div className="inventory-slot meteor-slot" aria-label={language === "ja" ? `小メテオ 残り${inventory.small}個` : `Small meteors: ${inventory.small} remaining`} title={`SMALL METEOR ×${inventory.small}`}><i className={`mini-meteor ${color}`}>●</i><b>×{inventory.small}</b></div>
      <div className="inventory-slot meteor-slot" aria-label={language === "ja" ? `大メテオ 残り${inventory.large}個` : `Large meteors: ${inventory.large} remaining`} title={`LARGE METEOR ×${inventory.large}`}><i className={`mini-meteor large ${color}`}>✦</i><b>×{inventory.large}</b></div>
      {loadoutHidden && <div className="inventory-slot loadout-hidden" aria-label={language === "ja" ? "アイテム構成は戦闘開始まで非公開" : "Item loadout remains hidden until the match begins"} title="SECRET LOADOUT"><i>◆</i><b>?</b></div>}
      {itemCounts.map(({ kind, count }) => <div key={kind} className={`inventory-slot inventory-item ${kind}`} aria-label={language === "ja" ? `${kind.toUpperCase()} 残り${count}個` : `${kind.toUpperCase()}: ${count} remaining`} title={`${kind.toUpperCase()} ×${count}`}><ItemIcon kind={kind} /><b>×{count}</b></div>)}
    </div>
  );
}
