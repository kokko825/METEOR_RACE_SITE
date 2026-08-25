/**
 * AIの戦術判断を調整する上級者向け設定です。
 * 通常は game-balance.ts の5項目だけを変更してください。
 * AIの性格や試合テンポを細かく変えたい場合だけ、この値を調整します。
 */
export const AI_STRATEGY = {
  score: {
    win: 1_000_000,
    rankStep: 100_000,
    ownProgress: 620,
    rivalProgress: 510,
    rivalPressure: 120,
    smallMeteor: 18,
    largeMeteor: 34,
    capsuleMeteor: 15,
    activeShield: 26,
    boosterMove: 8,
    mobility: 3,
    freeForAllRivalAdvance: 280,
    freeForAllRivalFinish: 900_000,
  },
  pacing: {
    multiplayerWarningWithMeteor: 210,
    multiplayerWarningEmpty: 90,
    duelWarningWithMeteor: 4_500,
    duelWarningEmpty: 1_800,
    overtimeStartsAfterRounds: 2,
    overtimeProgress: 22,
    classicRetreatPenalty: 260,
    itemRetreatPenalty: 170,
    earlyAdvanceBonus: 34,
    itemForwardTempo: 42,
  },
  placement: {
    openingHarassment: 2_500,
    remoteHarassmentPerCell: 620,
    ownAdvance: 90,
    rivalSetback: 70,
    futureGate: 46,
    quietGate: 120,
  },
  items: {
    orbitMinimumGain: 4,
    pulseMobility: 14,
    blastMobility: 5,
    shieldLossPenalty: 150,
    useThresholdEasy: -4,
    useThresholdNormal: 2,
    useThresholdHard: 5,
    reserve: {
      shield: 22,
      booster: 24,
      holo: 20,
      orbit: 24,
      blast: 22,
      pulse: 22,
      recall: 18,
      gravity: 0,
    },
  },
} as const;
