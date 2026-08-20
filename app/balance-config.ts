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

export const DEFAULT_BALANCE: BalanceConfig = {
  meteorSmallStart: 2,
  meteorLargeStart: 1,
  itemHandTotal: 3,
  itemSameMax: 2,
  shieldRounds: 1,
  boosterUses: 1,
  holoRounds: 4,
  holoUnlimited: 0,
  pulseRadius: 1,
  // BLAST is specified as the large-meteor blast, and a large meteor's radius
  // is a hard-coded 2 in applyMeteor. Keep these two in step.
  blastRadius: 2,
  emptyMeteorBonusMoves: 1,
  rankedGravityRounds: 5,
  aiProgressWeight: 100,
  aiDenialWeight: 100,
  aiResourceWeight: 100,
  aiRetreatPenalty: 100,
  aiCreativity: 22,
};

export const BALANCE_FIELDS = [
  { key: "meteorSmallStart", externalKey: "meteor.small.start", label: "小メテオ初期数", min: 0, max: 5, unit: "個" },
  { key: "meteorLargeStart", externalKey: "meteor.large.start", label: "大メテオ初期数", min: 0, max: 3, unit: "個" },
  { key: "itemHandTotal", externalKey: "item.hand.total", label: "アイテム持込総数", min: 1, max: 6, unit: "個" },
  { key: "itemSameMax", externalKey: "item.hand.same_max", label: "同一アイテム上限", min: 1, max: 3, unit: "個" },
  { key: "shieldRounds", externalKey: "item.shield.rounds", label: "シールド継続", min: 1, max: 3, unit: "巡" },
  { key: "boosterUses", externalKey: "item.booster.uses", label: "ブースター使用回数", min: 1, max: 99, unit: "回" },
  { key: "holoRounds", externalKey: "item.holo.rounds", label: "お邪魔継続", min: 1, max: 99, unit: "巡" },
  { key: "holoUnlimited", externalKey: "item.holo.unlimited", label: "ホロメテオ無制限", min: 0, max: 1, unit: "0=OFF / 1=ON" },
  { key: "blastRadius", externalKey: "item.blast.radius", label: "BLAST効果範囲", min: 1, max: 4, unit: "マス" },
  { key: "pulseRadius", externalKey: "item.pulse.radius", label: "PULSE効果範囲", min: 1, max: 4, unit: "マス" },
  { key: "emptyMeteorBonusMoves", externalKey: "meteor.empty.bonus_moves", label: "全消費ボーナス移動", min: 0, max: 1, unit: "回" },
  { key: "rankedGravityRounds", externalKey: "ranked.gravity.rounds", label: "軌道収束の発生周期", min: 3, max: 99, unit: "巡" },
  { key: "aiProgressWeight", externalKey: "ai.weight.progress", label: "AI 前進評価", min: 25, max: 200, unit: "%" },
  { key: "aiDenialWeight", externalKey: "ai.weight.denial", label: "AI 妨害評価", min: 25, max: 200, unit: "%" },
  { key: "aiResourceWeight", externalKey: "ai.weight.resource", label: "AI 資源温存評価", min: 25, max: 200, unit: "%" },
  { key: "aiRetreatPenalty", externalKey: "ai.penalty.retreat", label: "AI 後退への減点", min: 25, max: 200, unit: "%" },
  { key: "aiCreativity", externalKey: "ai.creativity", label: "AI 行動の揺らぎ", min: 0, max: 60, unit: "%" },
] as const;

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
