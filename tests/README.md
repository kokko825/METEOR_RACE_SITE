# テストの案内

すべてプロジェクトのルートから実行します。

| 対象 | 場所 / 実行方法 |
|---|---|
| 全体確認 | `npm run check` |
| ルール・AI・設定・HTML | このフォルダ直下の `.test.ts` と `run-*.mjs` |
| ブラウザの表示・操作 | `browser/` |
| ルーム・権限・同期 | `integration/` |

ブラウザ検査にはPlaywrightとブラウザのインストールが必要です。共用環境では `PLAYWRIGHT_MODULE` と `TEST_BROWSER_PATH` を指定できます。
ブラウザ・通信検査はローカルサーバーを起動し、`TEST_ORIGIN` にそのURLを指定して実行します。公開サイトへテストデータを書き込まないため、localhost以外は拒否します。

例：`node tests/browser/match-events.browser.mjs`、`node tests/integration/online-room.integration.mjs`。
変換済みテストは `.cache/tests/` に生成します。手作業で編集しません。
