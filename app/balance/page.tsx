"use client";

import { useEffect, useRef, useState } from "react";
import { BALANCE_FIELDS, DEFAULT_BALANCE, normalizeBalance, type BalanceConfig } from "../balance-config";

export default function BalancePage() {
  const [draft, setDraft] = useState<BalanceConfig>(DEFAULT_BALANCE);
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState("読み込み中…");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const response = await fetch("/api/balance?draft=1", { cache: "no-store" });
    const data = await response.json();
    setAdmin(response.ok && Boolean(data.admin));
    if (response.ok) {
      setDraft(normalizeBalance(data.draft));
      setRevision(data.revision ?? 0);
      setMessage("下書きを編集中");
    } else setMessage(data.error ?? "管理者として読み込めませんでした");
  };

  useEffect(() => { void load(); }, []);

  const post = async (action: string, balance?: BalanceConfig) => {
    setMessage("保存中…");
    const response = await fetch("/api/balance", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, balance }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "更新できませんでした");
    setRevision(data.revision ?? revision);
    if (data.balance) setDraft(normalizeBalance(data.balance));
    setMessage(action === "publish" ? "公開しました。進行中の試合は変えず、再読み込み後または次のNEW GAMEから反映されます" : action === "rollback" ? "直前の公開値へ戻しました。次のNEW GAMEから反映されます" : "下書きを保存しました");
  };

  const exportCsv = () => {
    const rows = ["設定キー,値,表示名,単位", ...BALANCE_FIELDS.map((field) =>
      `${field.externalKey},${draft[field.key]},${field.label},${field.unit}`,
    )];
    const blob = new Blob(["\ufeff" + rows.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `meteor-race-balance-r${revision}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importCsv = async (file: File) => {
    const text = (await file.text()).replace(/^\ufeff/, "");
    const values = { ...draft };
    for (const line of text.split(/\r?\n/).slice(1)) {
      const [externalKey, raw] = line.split(",");
      const field = BALANCE_FIELDS.find((candidate) => candidate.externalKey === externalKey?.trim());
      if (field && raw !== undefined) values[field.key] = Number(raw);
    }
    setDraft(normalizeBalance(values));
    setMessage("CSVを下書きへ読み込みました。まだ公開されていません");
  };

  if (admin === false) return <main className="balance-admin"><h1>BALANCE CONTROL</h1><p>{message}</p><a href="/">ゲームへ戻る</a></main>;

  return (
    <main className="balance-admin">
      <header>
        <div><small>METEOR RACE / ADMIN</small><h1>BALANCE CONTROL</h1><p>Revision {revision} · {message}</p></div>
        <a href="/">ゲームへ戻る</a>
      </header>
      <section className="balance-actions">
        <button onClick={() => void post("save_draft", draft)}>下書きを保存</button>
        <button onClick={() => void post("save_draft", draft).then(() => window.open("/?balance=draft", "_blank"))}>AILAB用に保存して試す</button>
        <button className="publish" onClick={() => window.confirm("この数値を全プレイヤーへ反映しますか？") && void post("save_draft", draft).then(() => post("publish"))}>サイト版へ反映</button>
        <button className="rollback" onClick={() => window.confirm("直前の公開値へ戻しますか？") && void post("rollback")}>直前版へ戻す</button>
        <button onClick={exportCsv}>Excel用CSVを書き出す</button>
        <button onClick={() => fileRef.current?.click()}>CSVを読み込む</button>
        <input ref={fileRef} hidden type="file" accept=".csv,text/csv" onChange={(event) => event.target.files?.[0] && void importCsv(event.target.files[0])} />
      </section>
      <section className="balance-grid" aria-label="バランス調整値">
        {BALANCE_FIELDS.map((field) => (
          <label key={field.key}>
            <span><b>{field.label}</b><code>{field.externalKey}</code></span>
            <input
              type="number" min={field.min} max={field.max} value={draft[field.key]}
              onChange={(event) => setDraft(normalizeBalance({ ...draft, [field.key]: Number(event.target.value) }))}
            />
            <i>{field.unit} / {field.min}～{field.max}</i>
          </label>
        ))}
      </section>
      <aside className="balance-note">
        <b>安全な変更手順</b>
        <p>CSVをExcelまたはNotionで編集 → 読み込み → 下書き保存 → AILABで試す → 問題なければ「サイト版へ反映」。公開後は再読み込みした未開始ゲームと次のNEW GAMEへ適用され、進行中の試合は変わりません。</p>
        <a href="https://app.notion.com/p/912d09d3c8aa4f5d99f03117108e1202" target="_blank" rel="noreferrer">Notion バランス調整DBを開く</a>
      </aside>
    </main>
  );
}
