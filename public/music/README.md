# 音源の置き場所

対応形式は `.ogg`、`.mp3`、`.wav` です。Web公開では通常 `.ogg` を推奨します。

## 単独音源

例として次の場所へ置き、`config/site-presentation.ts` にURLを書きます。

- `public/music/title.ogg` → `/music/title.ogg`
- `public/music/fanfare.ogg` → `/music/fanfare.ogg`
- `public/music/waiting.ogg` → `/music/waiting.ogg`
- `public/music/game-start.ogg` → `/music/game-start.ogg`

## 戦闘曲（5ステム）

各曲のフォルダへ、同じ長さ・BPMの5ファイルを置きます。

```text
public/music/battle/meteor/
  base.ogg
  pulse.ogg
  rhythm.ogg
  tension.ogg
  final.ogg
```

設定値は `/music/battle/meteor/` のようにフォルダ末尾まで入力します。ファイルがない場合は内蔵の仮BGMが再生されるため、1曲ずつ安全に追加できます。
