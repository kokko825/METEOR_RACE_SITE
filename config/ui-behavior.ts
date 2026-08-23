/** 画面演出とAI表示速度の調整値です。ゲームの強さやルールには影響しません。 */
export const UI_BEHAVIOR = {
  aiDefaultDelayMs: 420,
  aiMinimumDelayMs: 120,
  aiBonusMoveMinimumDelayMs: 420,
  aiSetupDelayMs: 30,
  labFastThresholdMs: 60,
  labMediumThresholdMs: 240,
  labEffectScaleFast: 0.08,
  labEffectScaleMedium: 0.18,
  labEffectScaleNormal: 0.48,
} as const;
