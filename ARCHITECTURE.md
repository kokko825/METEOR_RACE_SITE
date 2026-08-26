# METEOR RACE コード案内

このGitHubリポジトリが公開版の正本です。通常の調整では、最初に `config/` を編集します。

## フォルダの役割

| 場所 | 役割 | 普段編集するか |
|---|---|---|
| `config/` | バランス、AI重み、文章、色、音楽、安全設定 | はい |
| `public/assets/` | 画像、フォント、BGM、SE | 素材交換時 |
| `app/components/` | 盤上の駒や共通UI部品 | UI変更時 |
| `app/hooks/` | 設定保存、プロフィール、音楽、テーマ | 機能変更時 |
| `app/styles/` | 端末をまたぐ安全ルールなど、目的別CSS | UI変更時 |
| `app/api/` | オンライン部屋、チャット、問い合わせ | 通信変更時 |
| `app/game-rules.ts` | ルールを解決する純粋な処理 | ルール変更時 |
| `app/ai-engine.ts` | CPUの候補生成、先読み、評価 | AI変更時 |
| `app/page.tsx` | 画面状態と各処理を接続する中心画面 | 大きな機能変更時 |
| `tests/` | ルール、UI構造、全モードCPU試合 | 仕様変更と同時 |

## 変更内容から編集先を探す

- メテオ数、継続巡数、効果範囲 → `config/game-balance.ts`
- EASY／NORMAL／HARDの性格 → `config/ai-strategy.ts`
- 日本語・英語の文章 → `config/ui-copy.ts`
- BGM、色、発光 → `config/site-presentation.ts`
- SEや画像のファイル → `public/assets/`
- 駒、メテオ、所持欄 → `app/components/game-pieces.tsx`
- スマホで押せない、スクロールできない → `app/styles/responsive-safety.css`
- 勝敗やアイテム効果 → `app/game-rules.ts`
- CPUの手の選び方 → `app/ai-engine.ts`

## 必須確認

1. `npm run check` — 警告0、型、設定、素材、ルール、UI構造、ビルド
2. `npm run test:ai:quality` — 全盤面・全難易度の完走、後退、空振り、難易度差
3. PC・タブレット・スマホ縦で公開画面を確認

`npm run check` は警告も失敗扱いです。プレイヤー用画面にデバッグ表示を追加せず、診断は `tests/` 側へ追加します。
