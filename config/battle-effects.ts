/** Presentation only. The authoritative game rules never depend on these times. */
export const BATTLE_EFFECTS = {
  meteorImpactMs: 420,
  meteorMoveMs: 1100,
  meteorEndMs: 2020,
  itemMs: 1050,
  blastMs: 1050,
  receiptMs: 850,
} as const;

export const battleEffectsEnabled = (online: boolean, reduced: boolean) => online || !reduced;
