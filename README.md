# METEOR RACE

探査機とメテオの爆風を使い、盤面中央のCOREを目指すターン制対戦ゲームです。

公開版: https://meteor-race-latest.kou4desu.chatgpt.site/

## 最終版の内容

- CLASSIC：2〜4人対戦
- 2 VS 2 TEAM：RED＋YELLOW 対 BLUE＋GREEN
- ITEM 15×15：SHIELD、BOOSTER、使い捨てメテオ
- ローカル対戦、VS AI、AI LAB、オンラインルーム
- AI難易度：EASY、NORMAL、HARD
- 盤面、人数、モードに応じたAI評価
- アイテムは盤上最大6個。取得後2〜4ターンで別の場所へランダム再出現
- 効果音、爆風・吹き飛び・回収演出（BGMのみ対象外）

詳細は [GAME_SPEC.md](./GAME_SPEC.md) と [AI_SPEC.md](./AI_SPEC.md) を参照してください。

## 主なファイル

- `app/page.tsx`：ゲーム画面、演出、オンライン同期
- `app/game-rules.ts`：ゲーム状態とルール解決
- `app/ai-engine.ts`：AI判断
- `app/api/rooms/route.ts`：オンラインルーム
- `tests/game-rules.test.ts`：ルール回帰テスト
- `tests/ai-lab-simulation.ts`：AI局面テストと対戦シミュレーション

## 開発

```bash
npm install
npm run dev
npm run build
```
