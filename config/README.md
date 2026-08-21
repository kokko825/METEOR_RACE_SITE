# 人が編集する設定

通常の調整では `app/` を触らず、このフォルダだけを編集します。

- `game-balance.ts`：メテオ、アイテム、AI、ランク戦周期
- `site-presentation.ts`：色、広告、BGMのURLと再生設定

## 変更手順

1. 数値または文字列を変更する
2. `npm run check` を実行する
3. エラーがなければGitHubへ反映する

値の意味と安全範囲は `app/balance-config.ts` と `app/site-config.ts` にあります。
設定はGitHub上のファイルが正本で、D1の古い値には上書きされません。
