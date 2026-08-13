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
  itemRespawnMinTurns: number;
  itemRespawnMaxTurns: number;
  itemBoardMax: number;
  emptyMeteorBonusMoves: number;
};

export const DEFAULT_BALANCE: BalanceConfig = {
  meteorSmallStart: 2,
  meteorLargeStart: 1,
  itemHandTotal: 3,
  itemSameMax: 2,
  shieldRounds: 1,
  boosterUses: 1,
  holoRounds: 2,
  holoUnlimited: 0,
  pulseRadius: 1,
  itemRespawnMinTurns: 2,
  itemRespawnMaxTurns: 4,
  itemBoardMax: 6,
  emptyMeteorBonusMoves: 1,
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
  { key: "pulseRadius", externalKey: "item.pulse.radius", label: "BLAST効果範囲", min: 1, max: 4, unit: "マス" },
  { key: "emptyMeteorBonusMoves", externalKey: "meteor.empty.bonus_moves", label: "全消費ボーナス移動", min: 0, max: 1, unit: "回" },
] as const;

export function normalizeBalance(input?: Partial<BalanceConfig> | null): BalanceConfig {
  const next = { ...DEFAULT_BALANCE, ...(input ?? {}) };
  for (const field of BALANCE_FIELDS) {
    const value = Number(next[field.key]);
    next[field.key] = Math.max(field.min, Math.min(field.max, Number.isFinite(value) ? Math.round(value) : DEFAULT_BALANCE[field.key]));
  }
  next.itemRespawnMaxTurns = Math.max(next.itemRespawnMinTurns, next.itemRespawnMaxTurns);
  next.itemSameMax = Math.min(next.itemHandTotal, next.itemSameMax);
  return next;
}
