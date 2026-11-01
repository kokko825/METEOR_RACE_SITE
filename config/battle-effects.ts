/** Presentation only. The authoritative game rules never depend on these times. */
export const BATTLE_EFFECTS = {
  meteorImpactMs: 320,
  meteorMoveMs: 900,
  meteorEndMs: 1480,
  itemMs: 1050,
  blastMs: 1050,
  receiptMs: 850,
} as const;

export const battleEffectsEnabled = (online: boolean, reduced: boolean) => online || !reduced;

/** Short action receipts, separate from balance-dependent rules text. */
export const EQUIPMENT_RECEIPTS = {
  booster: { ja: "ブースター起動", en: "BOOSTER ENGAGED" },
  shield: { ja: "シールド展開", en: "SHIELD DEPLOYED" },
  pulse: { ja: "パルス作動", en: "PULSE ONLINE" },
  blast: { ja: "ブラスト発動", en: "BLAST FIRED" },
  holo: { ja: "ホロメテオ形成", en: "HOLO CONSTRUCTED" },
  recall: { ja: "メテオ回収", en: "RECALL EXECUTED" },
  orbit: { ja: "リング回転", en: "ORBIT ENGAGED" },
  gravity: { ja: "重力場発生", en: "GRAVITY ACTIVE" },
} as const;
