# METEOR RACE ローカル管理ツール

管理画面は公開サイトには置かず、このPC上だけで起動します。

## 起動（おすすめ）

`METEOR_RACE_管理画面.cmd` をダブルクリックします。管理画面は自動でブラウザに開きます。

黒い画面は管理ツール本体なので、使用中は閉じないでください。終了するときは黒い画面を閉じます。

## 手動で起動する場合

PowerShellで次を実行します。

```powershell
cd C:\Users\user\Documents\MeteorRace
npm run admin
```

起動後、ブラウザで次を開きます。

```text
http://localhost:3000/balance
```

Cloudflareに設定した `BALANCE_ADMIN_TOKEN` を入力すると、公開中の設定を読み込み、下書き保存・公開・復元ができます。トークンはブラウザのセッション内だけに保存されます。

終了するときはPowerShellで `Ctrl + C` を押します。

## 音源の交換

音楽タブでは MP3・WAV・OGG を直接選べます。タイトル・待機・開始音・ファンファーレに加え、4曲それぞれの5ステムを個別に交換できます。

1. 音源を選ぶ
2. 下書き保存
3. 試聴する
4. 「音源ファイルをサイトへ公開」
5. 「公開する」

音源ファイルは `public/music` に保存され、GitHubへの公開後にCloudflareへ自動反映されます。
