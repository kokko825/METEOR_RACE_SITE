# METEOR RACE

爆風を利用して盤面中央のCOREを目指す、2～4人用ターン制戦略ボードゲームです。

公開版: Version 53  
公開URL: https://meteor-race-game.kou4desu.chatgpt.site/

## ゲームモード

- CLASSIC: 2～4人の個人戦
- 2 VS 2 TEAM: RED＋YELLOW 対 BLUE＋GREEN
- ITEM 15×15: SHIELD、BOOSTER、使い捨てメテオを使用
- ローカル対戦、VS AI、AI LAB、ONLINE ROOM

## 盤面

- CLASSIC 2人: 9×9、11×11
- CLASSIC 3～4人: 11×11
- TEAM: 11×11、13×13、15×15
- ITEM: 15×15

9×9だけは外周際から開始し、11×11以上は人数に関係なく1周内側から開始します。
BOOSTERは2回の2マス移動を得ます。爆風で押される距離は通常どおりです。

## 基本ルール

1. 探査機を上下左右へ1マス移動
2. 小・大・使い捨てメテオを配置
3. 爆風移動、アイテム取得、メテオ破壊・回収を解決
4. 探査機がCOREへ到達すると勝利

先攻の初手は移動のみで、メテオを配置できません。

## 主な実装

- 2～4人対戦と2対2チーム戦
- 15×15アイテム戦
- 4色で異なる戦略を持つAI
- 通常移動と爆風到達を含む勝利脅威の先読み
- メテオ在庫、回収、布石、アイテムを考慮するAI
- オンラインルーム、観戦、途中参加、退出時AI引き継ぎ
- メテオ落下、爆風、吹き飛び、破壊・回収のオンライン同期
- チーム光輪、自機の「YOU」表示
- SHIELDとBOOSTERの機体上エフェクト
- 実際にCOREへ到達した勝者の色を使う終了表示

## 開発

```bash
npm install
npm run dev
npm run build
```

主要ファイル:

- `app/page.tsx`: 画面、入力、AI、オンライン同期
- `app/game-rules.ts`: ゲーム状態とルール解決
- `app/api/rooms/route.ts`: オンラインルームAPI
- `app/globals.css`: 表示と演出
