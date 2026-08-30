/** 素材を差し替えるときに確認する公開パス一覧です。 */
export const ASSET_PATHS = {
  branding: {
    favicon: "/assets/branding/METEOR_RACE_logo_w.png",
    socialCard: "/assets/branding/meteor-race-social-card.jpg",
    wordmark: "/assets/branding/METEOR_RACE_txt.svg",
    symbol: "/assets/branding/METEOR_RACE_logo.svg",
  },
  images: {
    itemPreviewBoard: "/assets/images/items/item-preview-board.jpg",
  },
  fonts: {
    sans: "/assets/fonts/geist-sans.woff2",
    mono: "/assets/fonts/geist-mono.woff2",
  },
  audioRoot: "/assets/audio/",
} as const;
