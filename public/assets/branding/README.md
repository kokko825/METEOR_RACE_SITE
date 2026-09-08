# ロゴと端末別アイコン

- 記号ロゴ：METEOR_RACE_logo.svg
- 文字ロゴ：METEOR_RACE_txt.svg
- アイコン生成元：METEOR_RACE_logo_w.png（白背景の正方形）
- icons/：生成された16・32・48・180・192・512pxのPNG
- ブラウザ互換用：public/favicon.ico（16・32・48pxを格納）
- iPhone/iPad：180pxのApple Touch Icon
- Android：192・512pxをpublic/site.webmanifestから指定

生成元を差し替えたら、正本のフォルダで次を実行します。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/generate-icons.ps1
```

ホーム画面追加時のアイコン対応であり、オフライン動作を追加するものではありません。
端末に保存済みの古いアイコンは、ショートカットを削除して追加し直す必要がある場合があります。
