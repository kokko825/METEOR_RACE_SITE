# 人が編集する設定

通常の調整では `app/` を触らず、このフォルダだけを編集します。

- `game-balance.ts`：メテオ、アイテム、AI、ランク戦周期
- `site-presentation.ts`：色、広告、BGMのURLと再生設定
- `ai-strategy.ts`：AIの細かな判断重み（上級調整）
- `ui-behavior.ts`：AI表示速度と演出タイミング
- `match-events.ts`：盤面イベントの周期・予告巡数・外周抽選率・演出の溜め/移動/終了時間
- `ui-layout.ts`：盤面の最大寸法、画面に占める比率、操作欄との間隔
- `ui-copy.ts`：日本語・英語の画面文章
- `community-safety.ts`：チャット文字数、保存期間、定型文、禁止表現
- `asset-paths.ts`：画像・フォント・音源の公開パス台帳

## どこを変更するか

- Google Analyticsの測定ID：`analytics.ts`

- アイテム個数・効果範囲・継続巡数 → `game-balance.ts`
- AIを前進型／妨害型へ寄せる → まず `game-balance.ts` の `ai...Weight`
- AIの個別判断を細かく変える → `ai-strategy.ts`
- 序盤の発展を優先する巡数 → 同ファイルの `placement.developmentRounds`（次手勝利への防御を除く）
- アイテムの一行の役割・設定由来の効果説明 → `app/item-content.ts`
- BGMやSEを差し替える → `site-presentation.ts` と `public/assets/audio/`
- ロゴ・OG画像・説明画像を差し替える → `asset-paths.ts` と `public/assets/`
- チャット規制や保存期間を変える → `community-safety.ts`
- 基本色や発光を変える → `site-presentation.ts`
- 日本語・英語の文章を直す → `ui-copy.ts`
- AIの画面上の待ち時間を変える → `ui-behavior.ts`
- オンライン・チャットの通信間隔と通知時間 → `ui-behavior.ts`
- イベントの予告と発動演出 → `match-events.ts`（時間）、`app/components/match-events.tsx`（表示）、`app/styles/match-events.css`（形・色）。進行同期は `app/hooks/use-field-event.ts`、ゲーム上の効果判定は `app/game-rules.ts`。
- 全体／BGM／効果音の初期音量 → `ui-behavior.ts` の `defaultVolumes`（既存の個人設定は維持）
- BGMを公開・休止する → `site-presentation.ts` の `musicEnabled`（1／0で再生と操作欄を連動）
- 盤面の大きさや余白の比率を変える → `ui-layout.ts`

## 変更手順

1. 数値または文字列を変更する
2. `npm run check` を実行する（範囲外や矛盾した設定はここでエラーになります）
3. エラーがなければGitHubへ反映する

値の意味と安全範囲は `app/balance-config.ts` と `app/site-config.ts` にあります。
編集する正本は `C:\Users\user\Documents\MeteorRace` です。GitHubへ反映して公開します。D1の古い値には上書きされません。

チュートリアル文章は `tutorial-copy.ts`、企業・装備の世界観は `item-lore.ts`、選択音や確定音の差し替えは `ui-feedback.ts`、更新履歴は `release-notes.ts` です。
画面のバージョン番号も `release-notes.ts` の先頭から取得します。別の番号を手動で重複管理しません。
設定項目を増やすときは、初期値だけでなく対応する検証と日英の説明も確認してください。

## 変更履歴

- 2026-10-10：序盤AI・アイテム説明・版番号の調整先を整理。
