/** UIの押し心地。音源を追加したら空文字を公開パスへ差し替えます。 */
export const UI_FEEDBACK = {
  sounds: {
    select: "",
    confirm: "",
    volumeTick: "",
  },
  gain: {
    select: 0.2,
    confirm: 0.34,
    volumeTick: 0.14,
  },
  vibrationMs: {
    select: 8,
    confirm: [18, 24, 32],
    volumeTick: 4,
  },
  volumeTickIntervalMs: 42,
  confirmSelector: '[data-ui-feedback="confirm"],.entry-confirm,.result-rematch',
  ignoreSelector: '.board button,[data-ui-feedback="none"]',
} as const;

export type UiFeedbackKind = keyof typeof UI_FEEDBACK.sounds;
