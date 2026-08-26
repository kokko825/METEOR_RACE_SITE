import type { CSSProperties } from "react";
import { ITEM_ICONS } from "../item-content";
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
  shield: "BLAST BLOCKED",
  booster: "METEOR JUMP",
  holo: "TEMPORARY BLOCK",
  orbit: "RING ROTATE 90°",
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
}: {
  player: Player;
  rotation: number;
  push?: { from: Pos; dr: number; dc: number };
  teamMode?: boolean;
  isSelf?: boolean;
  shieldTurns?: number;
  boost?: number;
  settling?: boolean;
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
        <span className="probe-effects" aria-label={`${shieldTurns > 0 ? `シールド${shieldTurns} ` : ""}${boost > 0 ? `ブースト${boost}` : ""}`}>
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

export function ObstacleIcon({ obstacle, roundsLeft }: { obstacle: ObstacleMeteor; roundsLeft: number }) {
  const roundsLabel = roundsLeft === -1 ? "∞" : String(roundsLeft);
  return (
    <span className={`obstacle-token ${obstacle.owner}`} title={roundsLeft === -1 ? "破壊不能のホロメテオ・無制限" : `ホロメテオ・残り${roundsLeft}巡（爆風で短縮）`}>
      <i /><b>{roundsLabel}</b><small>巡</small>
    </span>
  );
}

export function PulseDeviceIcon({ device, roundsLeft }: { device: PulseDevice; roundsLeft: number }) {
  return <span className={`pulse-device ${device.owner}`} title={`PULSE発生装置・残り${roundsLeft}巡`}><i /><b>PULSE</b><small>{roundsLeft}</small></span>;
}

export function InventoryPanel({ inventory, color, items, loadoutHidden = false }: {
  inventory: Record<MeteorSize, number>;
  color: Player;
  items: ItemKind[];
  loadoutHidden?: boolean;
}) {
  const itemCounts = (["shield", "booster", "holo", "orbit", "blast", "pulse", "recall"] as ItemKind[])
    .map((kind) => ({ kind, count: items.filter((item) => item === kind).length }))
    .filter(({ count }) => count > 0);
  return (
    <div className="inventory">
      <span>ARSENAL / 所持メテオ</span>
      <div className="inventory-slot meteor-slot" aria-label={`小メテオ 残り${inventory.small}個`} title={`SMALL METEOR ×${inventory.small}`}><i className={`mini-meteor ${color}`}>●</i><b>×{inventory.small}</b></div>
      <div className="inventory-slot meteor-slot" aria-label={`大メテオ 残り${inventory.large}個`} title={`LARGE METEOR ×${inventory.large}`}><i className={`mini-meteor large ${color}`}>✦</i><b>×{inventory.large}</b></div>
      {loadoutHidden && <div className="inventory-slot loadout-hidden" aria-label="アイテム構成は戦闘開始まで非公開" title="SECRET LOADOUT"><i>◆</i><b>?</b></div>}
      {itemCounts.map(({ kind, count }) => <div key={kind} className={`inventory-slot inventory-item ${kind}`} aria-label={`${kind.toUpperCase()} 残り${count}個`} title={`${kind.toUpperCase()} ×${count}`}><ItemIcon kind={kind} /><b>×{count}</b></div>)}
    </div>
  );
}
