# 音源素材の置き場所

対応形式は `.ogg`、`.mp3`、`.wav` です。Web公開では通常 `.ogg` を推奨します。

## 単独音源

単独BGMは `music/`、効果音素材は `sfx/` に入れます。ファイル名は用途が分かる英小文字とハイフンを使用してください。

- `public/assets/audio/music/title-theme.ogg` → `/assets/audio/music/title-theme.ogg`
- `public/assets/audio/music/victory-fanfare.ogg` → `/assets/audio/music/victory-fanfare.ogg`
- `public/assets/audio/music/waiting-room.ogg` → `/assets/audio/music/waiting-room.ogg`
- `public/assets/audio/sfx/game-start.ogg` → `/assets/audio/sfx/game-start.ogg`

UI操作音は `config/ui-feedback.ts` の `sounds` に公開パスを設定します。空文字の間は内蔵の仮音が鳴ります。

- `select`：通常の選択音
- `confirm`：ゲーム開始・再戦など重要操作の確定音
- `volumeTick`：音量スライダーの刻み音

## 戦闘曲（5ステム）

各曲のフォルダへ、同じ長さ・BPMの5ファイルを置きます。

```text
public/assets/audio/music/battle/meteor-theme/
  base.ogg
  pulse.ogg
  rhythm.ogg
  tension.ogg
  final.ogg
```

設定値は `/assets/audio/music/battle/meteor-theme/` のようにフォルダ末尾まで入力します。ファイルがない場合は内蔵の仮BGMが再生されるため、1曲ずつ安全に追加できます。

音量のピークはクリッピングを避け、同じ用途の素材は体感音量をそろえてください。素材の権利者と利用条件もファイル名と一緒に制作記録へ残してください。
