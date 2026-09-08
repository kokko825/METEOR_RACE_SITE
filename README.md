# METEOR RACE

## 保存場所

- 編集する正本：`C:\Users\user\Documents\MeteorRace`
- Codex内のバックアップ：`C:\Users\user\Documents\Codex\2026-07-27\2-2-15-15\work\meteor-race-complete`
- 調整場所は [config/README.md](./config/README.md)、処理の役割は [ARCHITECTURE.md](./docs/ARCHITECTURE.md) を参照。
- 旧正本はGitブランチ `backup/before-cleanup-2026-09-08` に保存。秘密設定 `.dev.vars` とローカルデータ `.wrangler` は上書きしない。

探査機とメテオの爆風を使い、盤面中央のCOREを目指すターン制対戦ゲームです。

公開版: https://meteorrace.follnest.com/

## 最終版の内容

- CLASSIC：2〜4人対戦
- 2 VS 2 TEAM：RED＋YELLOW 対 BLUE＋GREEN
- ITEM：11×11・13×13・15×15、7種類の持込アイテム
- ローカル対戦、VS AI、AI LAB、オンラインルーム
- AI難易度：EASY、NORMAL、HARD
- 盤面、人数、モードに応じたAI評価
- アイテムはセットアップ時にARSENAL（持込3個）を選択し、盤面には配置せず直接使用
- 効果音、爆風・吹き飛び・回収演出（BGMのみ対象外）

詳細は [GAME_SPEC.md](./docs/GAME_SPEC.md) と [AI_SPEC.md](./docs/AI_SPEC.md) を参照してください。

## 主なファイル

- `config/game-balance.ts`：人が編集するゲームバランスとAI調整値
- `config/site-presentation.ts`：人が編集する色・広告・音楽設定
- `config/ai-strategy.ts`：AIの細かな判断重み（上級調整）
- `config/ui-behavior.ts`：AI表示速度と演出タイミング
- `config/ui-copy.ts`：日本語・英語の画面文章
- `public/assets/`：ロゴ、画像、フォント、BGM、SEを用途別にまとめた素材置き場
- `app/page.tsx`：ゲーム画面、演出、オンライン同期
- `app/game-rules.ts`：ゲーム状態とルール解決
- `app/ai-engine.ts`：AI判断
- `app/api/rooms/route.ts`：オンラインルーム
- `app/balance-config.ts` / `app/api/balance/route.ts`：ゲームバランス設定と公開値の読み込み
- `app/site-config.ts` / `app/api/site-config/route.ts`：広告枠・インタラクティブミュージック設定の読み込み
- `app/components/ad-slot.tsx`：広告レディな表示枠（`site-config` でON/OFFするまで何も描画しない）
- `app/components/game-pieces.tsx`：探査機、メテオ、アイテム、所持欄の共通表示
- `app/styles/responsive-safety.css`：タップ領域、フォーカス、スマホの安全なスクロール
- `app/music-engine.ts`：インタラクティブミュージックのクロスフェード・エンジン（トラックURL未設定時はプロシージャル生成で自動フォールバック）
- `tests/game-rules.test.ts`：ルール回帰テスト
- `tests/ai-lab-simulation.ts`：AI局面テストと対戦シミュレーション

## 開発

```bash
npm install
npm run dev
npm run build
npm run check
```

`npm run check` は設定値検査、Lint、TypeScript、ルール、アイテム戦、AI完走、画面構成、公開ビルドをまとめて確認します。全モードの長時間AI評価は `npm run test:ai`、20試合のアイテムAI統計は `npm run test:switch-ai` です。

公開版の正本は、このフォルダを接続したGitHubリポジトリ `kokko825/METEOR_RACE_SITE` の `main` ブランチです。ファイルの役割は [ARCHITECTURE.md](./docs/ARCHITECTURE.md) にまとめています。

## 資料と公開手順

- [資料一覧](./docs/README.md)
- [公開・運用手順](./docs/DEPLOYMENT.md)
- [素材・アイコンの差し替え](./public/assets/branding/README.md)
