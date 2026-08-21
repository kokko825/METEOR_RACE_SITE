import { GAME_BALANCE } from "../config/game-balance";

export type BalanceConfig = {
  meteorSmallStart: number;
  meteorLargeStart: number;
  itemHandTotal: number;
  itemSameMax: number;
  shieldRounds: number;
  boosterUses: number;
  holoRounds: number;
  holoUnlimited: number;
  pulseRadius: number;
  blastRadius: number;
  emptyMeteorBonusMoves: number;
  rankedGravityRounds: number;
  aiProgressWeight: number;
  aiDenialWeight: number;
  aiResourceWeight: number;
  aiRetreatPenalty: number;
  aiCreativity: number;
};

export const DEFAULT_BALANCE: BalanceConfig = { ...GAME_BALANCE };

export const BALANCE_FIELDS = [
  { key: "meteorSmallStart", group: "meteor", externalKey: "meteor.small.start", label: "小メテオ初期数", min: 0, max: 5, unit: "個" },
  { key: "meteorLargeStart", group: "meteor", externalKey: "meteor.large.start", label: "大メテオ初期数", min: 0, max: 3, unit: "個" },
  { key: "emptyMeteorBonusMoves", group: "meteor", externalKey: "meteor.empty.bonus_moves", label: "全消費ボーナス移動", min: 0, max: 1, unit: "回" },
  { key: "rankedGravityRounds", group: "meteor", externalKey: "ranked.gravity.rounds", label: "軌道収束の発生周期", min: 3, max: 99, unit: "巡" },
  { key: "itemHandTotal", group: "item", externalKey: "item.hand.total", label: "アイテム持込総数", min: 1, max: 6, unit: "個" },
  { key: "itemSameMax", group: "item", externalKey: "item.hand.same_max", label: "同一アイテム上限", min: 1, max: 3, unit: "個" },
  { key: "shieldRounds", group: "item", externalKey: "item.shield.rounds", label: "SHIELD継続", min: 1, max: 3, unit: "巡" },
  { key: "boosterUses", group: "item", externalKey: "item.booster.uses", label: "BOOSTER使用回数", min: 1, max: 99, unit: "回" },
  { key: "holoRounds", group: "item", externalKey: "item.holo.rounds", label: "HOLO継続", min: 1, max: 99, unit: "巡" },
  { key: "holoUnlimited", group: "item", externalKey: "item.holo.unlimited", label: "HOLO無制限", min: 0, max: 1, unit: "0=OFF / 1=ON" },
  { key: "blastRadius", group: "item", externalKey: "item.blast.radius", label: "BLAST効果範囲", min: 1, max: 4, unit: "マス" },
  { key: "pulseRadius", group: "item", externalKey: "item.pulse.radius", label: "PULSE効果範囲", min: 1, max: 4, unit: "マス" },
  { key: "aiProgressWeight", group: "ai", externalKey: "ai.weight.progress", label: "前進評価", min: 25, max: 200, unit: "%" },
  { key: "aiDenialWeight", group: "ai", externalKey: "ai.weight.denial", label: "妨害評価", min: 25, max: 200, unit: "%" },
  { key: "aiResourceWeight", group: "ai", externalKey: "ai.weight.resource", label: "資源温存評価", min: 25, max: 200, unit: "%" },
  { key: "aiRetreatPenalty", group: "ai", externalKey: "ai.penalty.retreat", label: "後退への減点", min: 25, max: 200, unit: "%" },
  { key: "aiCreativity", group: "ai", externalKey: "ai.creativity", label: "行動の揺らぎ", min: 0, max: 60, unit: "%" },
] as const;

export type BalanceGroup = (typeof BALANCE_FIELDS)[number]["group"];

export const AI_PRESETS = {
  balanced: { label: "バランス型", description: "前進と必要な妨害を両立する標準設定", values: { aiProgressWeight: 100, aiDenialWeight: 100, aiResourceWeight: 100, aiRetreatPenalty: 100, aiCreativity: 22 } },
  racer: { label: "前進型", description: "停滞を避け、COREへ向かう展開を増やす", values: { aiProgressWeight: 125, aiDenialWeight: 82, aiResourceWeight: 92, aiRetreatPenalty: 125, aiCreativity: 18 } },
  tactician: { label: "戦術型", description: "布石と資源管理を重視しつつ妨害過多を防ぐ", values: { aiProgressWeight: 105, aiDenialWeight: 108, aiResourceWeight: 125, aiRetreatPenalty: 115, aiCreativity: 14 } },
  lively: { label: "多様型", description: "好手を守りながら行動の種類を増やす", values: { aiProgressWeight: 110, aiDenialWeight: 92, aiResourceWeight: 90, aiRetreatPenalty: 110, aiCreativity: 34 } },
} as const;

export function normalizeBalance(input?: Partial<BalanceConfig> | null): BalanceConfig {
  const next = { ...DEFAULT_BALANCE, ...(input ?? {}) };
  for (const field of BALANCE_FIELDS) {
    const value = Number(next[field.key]);
    next[field.key] = Math.max(field.min, Math.min(field.max, Number.isFinite(value) ? Math.round(value) : DEFAULT_BALANCE[field.key]));
  }
  next.itemSameMax = Math.min(next.itemHandTotal, next.itemSameMax);
  return next;
}

export function balanceWarnings(input?: Partial<BalanceConfig> | null): string[] {
  const value = normalizeBalance(input);
  const warnings: string[] = [];
  if (value.aiDenialWeight > value.aiProgressWeight * 1.25) warnings.push("妨害評価が前進評価より高く、試合が停滞しやすい設定です。");
  if (value.aiProgressWeight > value.aiDenialWeight * 1.65) warnings.push("前進評価が妨害評価より大幅に高く、ゴール直前の相手を見逃す可能性があります。");
  if (value.aiRetreatPenalty < 70) warnings.push("後退への減点が低く、通常戦で無駄な後方移動が増える可能性があります。");
  if (value.aiCreativity > 45) warnings.push("行動の揺らぎが大きく、明確な好手を選ばない場面が増える可能性があります。");
  if (value.rankedGravityRounds > 8) warnings.push("軌道収束の間隔が長く、ランク戦の停滞防止が弱くなります。");
  if (value.shieldRounds > 2) warnings.push("SHIELDが長く、CORE直前の防御が強すぎる可能性があります。");
  if (value.itemHandTotal > 4) warnings.push("持ち込みアイテムが多く、妨害の連続使用が増える可能性があります。");
  return warnings;
}
