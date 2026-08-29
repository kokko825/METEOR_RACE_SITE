import { SELECTABLE_ITEMS, type ItemKind } from "./game-rules";
import type { BalanceConfig } from "./balance-config";

/**
 * Single source of truth for the player-facing item copy.
 *
 * This lives outside page.tsx because the same text now has two audiences:
 * the in-game panels (client) and the /items guide page (server-rendered, and
 * therefore the version search engines actually read). Duplicating it would
 * guarantee the two drift apart the next time a balance value changes.
 */

export { SELECTABLE_ITEMS };

export const ITEM_ICONS: Record<ItemKind, string> = {
  shield: "⬡",
  booster: "▲",
  holo: "▣",
  orbit: "↻",
  blast: "✹",
  pulse: "ϟ",
  recall: "↩",
  gravity: "◎",
};

/** Balance-independent fallback copy, used for items whose text has no tunable numbers in it. */
export const ITEM_DETAILS: Record<ItemKind, string> = {
  shield: "1巡のあいだ爆風を防ぐ防御フィールド。自分の爆風も無効になります。",
  booster: "縦横へ最大2マス前進。途中のメテオを飛び越えてCOREへ到達できます。",
  holo: "4巡残るホロメテオを配置し、相手の進路を封鎖します。",
  orbit: "選んだリングを90度回転させ、盤上の配置をまとめて動かします。",
  blast: "指定地点に回収効果のないメテオ爆風を発生させます。",
  pulse: "装置を置き、2巡のあいだ周囲の自力移動を封じます。",
  recall: "盤上にある自分の通常メテオを手札に戻します。自分が置いたホロメテオも同時に盤上から取り除かれますが、こちらは手札には戻りません。",
  gravity: "全探査機をCORE方向へ1マス引き寄せます。",
};

export const ITEM_DETAILS_EN: Record<ItemKind, string> = {
  shield: "Blocks blast effects for one round, including your own blasts.",
  booster: "Move up to two orthogonal cells, jump over meteors, and enter the CORE.",
  holo: "Place a temporary holo meteor that blocks routes.",
  orbit: "Rotate one selected ring 90 degrees with every object on it.",
  blast: "Create a meteor-like blast at any target without leaving or recovering a meteor.",
  pulse: "Place a device that prevents voluntary movement in its area for two rounds.",
  recall: "Return all your normal meteors to inventory and remove your holo meteors.",
  gravity: "Pull every probe one cell toward the CORE.",
};

export function itemDetail(kind: ItemKind, balance: BalanceConfig, language: "ja" | "en" = "ja"): string {
  if (language === "en") {
    switch (kind) {
      case "shield": return `Blocks incoming blasts for ${balance.shieldRounds} round(s), including your own blasts.`;
      case "booster": return `Grants ${balance.boosterUses} two-cell orthogonal move(s). Jump over meteors and holo meteors and enter the CORE; the effect remains until the full move is used.`;
      case "holo": return balance.holoUnlimited
        ? "Places a permanent holo meteor that blocks routes."
        : `Places a holo meteor for ${balance.holoRounds} rounds. Blasts reduce its remaining duration, with stronger blasts dealing more damage.`;
      case "blast": return `Creates only a large-meteor blast at the target and within ${balance.blastRadius} outer cell(s). It leaves no meteor and recovers nothing.`;
      case "pulse": return `Places a device that prevents voluntary movement within ${balance.pulseRadius} outer cell(s) for two rounds.`;
      case "gravity": return `Every ${balance.rankedGravityRounds} rounds, pulls every probe one cell toward the CORE.`;
      default: return ITEM_DETAILS_EN[kind];
    }
  }
  switch (kind) {
    case "shield": return `${balance.shieldRounds}巡の間、受ける爆風を防ぎます。自分の爆風も無効になります。`;
    case "booster": return `縦横へ最大2マス進める効果を${balance.boosterUses}回使えます。途中のメテオやお邪魔メテオを飛び越えてCOREへ到達できます。2マス移動で実際に使うまで効果は持続します。`;
    case "holo": return balance.holoUnlimited
      ? "消滅しないホロメテオを配置し、相手の進路を妨害します。"
      : `${balance.holoRounds}巡残るホロメテオを配置し、相手の進路を妨害します。爆風を受けると残り時間が縮み、威力が高いほど大きく削られます。`;
    case "blast": return `指定地点と外周${balance.blastRadius}マスに、大メテオと同じ爆風だけを発生させます。メテオは残らず、回収効果もありません。`;
    case "pulse": return `装置を置き、外周${balance.pulseRadius}マス以内の自力移動を2巡封じます。`;
    case "gravity": return `${balance.rankedGravityRounds}巡ごとに、全探査機をCORE方向へ1マス引き寄せます。`;
    default: return ITEM_DETAILS[kind];
  }
}

export function itemEffectFacts(kind: ItemKind, balance: BalanceConfig, language: "ja" | "en" = "ja"): [string, string] {
  if (language === "en") {
    switch (kind) {
      case "shield": return [`Duration: ${balance.shieldRounds} round(s)`, "Cancels enemy and self-inflicted blasts"];
      case "booster": return [`Uses: ${balance.boosterUses}`, "Move two cells and jump over meteors"];
      case "holo": return [balance.holoUnlimited ? "Duration: unlimited" : `Duration: ${balance.holoRounds} rounds`, "Place an impassable obstacle"];
      case "orbit": return ["Rotation: 90°", "Move every object on the chosen ring"];
      case "blast": return [`Area: target + ${balance.blastRadius} outer cell(s)`, "Create a blast without a meteor"];
      case "pulse": return [`Area: target + ${balance.pulseRadius} outer cell(s)`, "Prevent voluntary movement for two rounds"];
      case "recall": return ["Targets: all your meteors", "Return normal meteors; remove holos"];
      case "gravity": return [`Cycle: ${balance.rankedGravityRounds} rounds`, "Move every probe one cell toward CORE"];
    }
  }
  switch (kind) {
    case "shield": return [`有効：${balance.shieldRounds}巡`, "敵と自分の爆風を無効化"];
    case "booster": return [`使用：${balance.boosterUses}回`, "縦横2マス進みメテオを飛び越える"];
    case "holo": return [balance.holoUnlimited ? "残存：無制限" : `残存：${balance.holoRounds}巡`, "破壊不能の障害物として設置"];
    case "orbit": return ["回転：90度", "選択したリング上の配置を移動"];
    case "blast": return [`範囲：中心＋外周${balance.blastRadius}マス`, "爆風だけを指定地点に発生"];
    case "pulse": return [`範囲：中心＋外周${balance.pulseRadius}マス`, "2巡の間、自力移動を封じる"];
    case "recall": return ["対象：盤上の自分のメテオ", "通常は手札へ、ホロは取り除くだけ"];
    case "gravity": return [`周期：${balance.rankedGravityRounds}巡`, "盤上の全探査機をCORE方向へ1マス移動"];
  }
}

/** One-line tactical note per item — written for the guide page, where a reader has no board in front of them. */
export const ITEM_TACTICS: Record<ItemKind, string> = {
  shield: "COREへ詰める直前に張ると、相手の妨害用の爆風を1巡のあいだ無効化して押し切れます。自分の爆風も消えるため、爆風で進む手とは併用できません。",
  booster: "唯一の純粋な前進アイテム。メテオやお邪魔メテオを飛び越えられるので、進路が塞がれた局面の突破口になります。実際に2マス進むまで効果が残るのが強みです。",
  holo: "相手がCOREへ入る一歩手前のマスに置くのが最も効きます。ただし完全な不動物ではなく、隣接するメテオの爆風を受けると残り時間が削られます。大メテオを至近距離で当てられると一気に消えるため、爆風の届かない位置を選ぶのが確実です。",
  orbit: "盤面をまとめて回すので、相手の有利な配置ごとずらせます。自分のメテオやPULSE装置も一緒に動く点に注意が必要です。",
  blast: "手持ちのメテオを消費せずに、大メテオと同じ爆風だけを起こせます。COREに近い相手を弾き飛ばす、逆転向けの一手です。お邪魔メテオを削る手段としても有効です。",
  pulse: "範囲内の探査機は自力移動ができなくなります。相手の前進を丸ごと止められる、最も直接的な妨害手段です。",
  recall: "盤上に置いた自分の通常メテオを手札に戻せるので、終盤の弾切れを防げます。自分のホロメテオも一緒に消える点に注意してください。",
  gravity: "真剣タイマン限定の自動イベントです。",
};
