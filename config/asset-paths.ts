/** 素材を差し替えるときに確認する公開パス一覧です。 */
export const ASSET_PATHS = {
  branding: {
    favicon: "/assets/branding/meteor-race-mark.svg",
    meteorRaceMark: "/assets/branding/meteor-race-mark.svg",
    regulaMark: "/assets/branding/regula-mark.svg",
    socialCard: "/assets/branding/meteor-race-social-card.jpg",
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
