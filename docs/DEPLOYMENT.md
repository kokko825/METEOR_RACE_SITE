## 独自公開手順（ChatGPT Sites非依存）

### 更新と復旧の確認

- 既存環境では新規DB作成やドメイン設定を繰り返さない。公開対象の差分を限定し、`npm run check` と変更機能の回帰試験を実行する。制作途中の音源・別作業は混ぜない。
- 公開後はトップ、対戦開始、更新履歴、必要な通信を確認する。コード送信・ビルド成功・公開反映は別々に記録する。
- 障害時は新しい操作を増やす前に、影響範囲と直前の正常なデプロイを確認する。[Workersのロールバック](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)はコードの復旧であり、DBの変更を戻すものではない。
- DBの復旧は別手順とし、対象と復旧時点を本人が確認してから実施する。[D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)の利用可能期間は契約とダッシュボードで確認する。本番データをAI作業フォルダへ複製せず、まずダミーデータの検証環境で復元を練習する。
- 日常確認は公開の到達性、エラー増加、使用量・無料枠、問い合わせの通知状態。通知失敗と報告自体の保存失敗を区別する。
- 復旧手順の文書化と復旧試験の完了は別。2026-11-01時点の今回監査では本番復旧・メール受信を実演していない。

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
