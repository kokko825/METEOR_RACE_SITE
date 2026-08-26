# METEOR RACE

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

詳細は [GAME_SPEC.md](./GAME_SPEC.md) と [AI_SPEC.md](./AI_SPEC.md) を参照してください。

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

公開版の正本は、このフォルダを接続したGitHubリポジトリ `kokko825/METEOR_RACE_SITE` の `main` ブランチです。ファイルの役割は [ARCHITECTURE.md](./ARCHITECTURE.md) にまとめています。

## 独自公開手順（ChatGPT Sites非依存）

公開コードはCloudflare Workers向けに構成済みです。初めて別環境へ複製する場合だけ、以下のCloudflare側設定が必要です。

### A. Cloudflareにドメインを追加する

1. [dash.cloudflare.com](https://dash.cloudflare.com) でCloudflareアカウントを作成（無料）
2. 左メニュー「Websites」→「Add a domain」で取得済みのドメインを入力
3. Cloudflareの無料プランを選択
4. 表示される2つのネームサーバー（例：`xxx.ns.cloudflare.com`）を控える
   - **ドメインをCloudflare Registrar以外（お名前.com、Google Domains等）で買った場合**：そのレジストラの管理画面で、ネームサーバーをCloudflareが指定した2つに変更する（反映まで数分〜24時間）
   - **Cloudflare Registrarで買った場合**：この手順は不要、そのまま進めます
5. Cloudflareダッシュボードに戻り、「Check nameservers」でアクティブ化を待つ（ステータスが「Active」になればOK）

### B. Cloudflareにログインしてデプロイ準備

1. このフォルダ（`C:\Users\user\Documents\MeteorRace`）でターミナルを開く
2. `npx wrangler login` を実行 → ブラウザが開くのでCloudflareアカウントで認証を許可
3. `npx wrangler d1 create meteor-race-db` を実行し、出力された `database_id` を `wrangler.jsonc` の `d1_databases[0].database_id` に貼り付ける
4. `npx vinext deploy` を実行 → `*.workers.dev` のURLが発行され、これだけでもう公開状態になります

### C. 独自ドメインをWorkerに接続する

1. Cloudflareダッシュボード →「Workers & Pages」→ デプロイされた `meteor-race` を選択
2. 「Settings」→「Domains & Routes」→「Add」→「Custom Domain」
3. 使いたいサブドメイン（例：`meteorrace.あなたのドメイン.com`）を入力して追加
4. 自動でDNSレコードが作成され、数分でHTTPS付きで独自ドメインからアクセスできるようになります
   - ルート直下（`あなたのドメイン.com`）を親ブランドサイト、`meteorrace.あなたのドメイン.com` をMETEOR RACE用、のようにサブドメインを分ける場合は、この「Add Custom Domain」を別プロジェクトごとに繰り返します

### D. GitHubと連携する（任意・推奨）

1. GitHubで空のリポジトリを作成（例：`meteor-race`）
2. このフォルダで：
   ```bash
   git remote add origin https://github.com/<あなたのアカウント>/meteor-race.git
   git push -u origin main
   ```
3. Cloudflareダッシュボードの「Workers & Pages」→ 対象プロジェクト →「Settings」→「Builds」でGitHubリポジトリを接続すると、以後 `git push` するだけで自動的にビルド・デプロイされるようになります（`npx vinext deploy` を毎回手動で打つ必要がなくなります）

### E. 独自ドメインメール（任意）

1. Cloudflareダッシュボード →「Email」→「Email Routing」を有効化
2. `contact@あなたのドメイン.com` 宛のメールを普段使っているGmail等へ転送する設定を追加

---

**月額0円運用のため**：無料枠を超えそうになったら自動課金ではなく、機能縮退（新規オンライン対戦の受付停止など）を検討してください。詳細は [FREE_SITE_OPERATION_PLAN.md](./FREE_SITE_OPERATION_PLAN.md) を参照。

広告・音楽・バランス・安全設定は `config/` を編集し、`npm run check` が成功してからGitHubへ反映します。ブラウザ上およびPC内の専用管理画面は使用しません。素材の置き方は `public/assets/audio/README.md` と `config/README.md` を参照してください。

<!-- Cloudflare Workers Builds connectivity test: 2026-08-18T02:14:21Z -->
<!-- build fix verification: 2026-08-18T02:23:44Z -->
