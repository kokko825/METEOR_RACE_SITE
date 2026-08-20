# METEOR RACE ローカル管理ツール

管理画面は公開サイトには置かず、このPC上だけで起動します。

## 起動

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
