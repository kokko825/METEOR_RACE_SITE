/**
 * 人が編集するサイト表示・音楽設定です。
 * 音源を使う場合は public/assets/audio/README.md の配置規則に従い、URLを入力します。
 * 空文字の音源は内蔵の仮BGMへ自動的に切り替わります。
 */
export const SITE_PRESENTATION = {
  adsEnabled: 0,
  adSlotTitle: 0,
  adSlotResult: 0,
  adSlotSettings: 0,
  // BGM完成後に1へ戻すと、再生・音量フェーダー・曲選択を再公開します。
  musicEnabled: 0,
  musicCrossfadeMs: 400,
  musicBpm: 120,
  musicBeatsPerBar: 4,
  musicTitleUrl: "",
  musicFanfareUrl: "",
  musicWaitingUrl: "",
  musicGameStartSeUrl: "",
  musicMeteorBaseUrl: "",
  musicOrbitBaseUrl: "",
  musicZeroGravityBaseUrl: "",
  musicCosmicErrorBaseUrl: "",
  themeAccent: "#63dfff",
  themeWarm: "#ff9248",
  themeBackground: "#03070d",
  themeText: "#e8f7ff",
  themeGlow: 100,
  themePanelOpacity: 86,
} as const;
