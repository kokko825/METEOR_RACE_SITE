/**
 * 人が編集するゲームバランス設定です。
 * 数値を変更したら `npm run check` を実行してください。
 * 許容範囲外の値は app/balance-config.ts が安全な範囲へ補正します。
 */
export const GAME_BALANCE = {
  meteorSmallStart: 2,
  meteorLargeStart: 1,
  itemHandTotal: 3,
  itemSameMax: 2,
  shieldRounds: 1,
  boosterUses: 1,
  holoRounds: 4,
  holoUnlimited: 0,
  pulseRadius: 1,
  blastRadius: 2,
  emptyMeteorBonusMoves: 1,
  rankedGravityRounds: 5,
  matchTurnLimit: 120,
  aiProgressWeight: 100,
  aiDenialWeight: 100,
  aiResourceWeight: 100,
  aiRetreatPenalty: 100,
  aiCreativity: 22,
} as const;
