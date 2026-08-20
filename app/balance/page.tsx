"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { AI_PRESETS, BALANCE_FIELDS, DEFAULT_BALANCE, balanceWarnings, normalizeBalance, type BalanceConfig, type BalanceGroup } from "../balance-config";
import { DEFAULT_SITE_CONFIG, SITE_CONFIG_THEME_COLOR_FIELDS, SITE_CONFIG_THEME_NUMBER_FIELDS, SITE_CONFIG_TOGGLE_FIELDS, SITE_CONFIG_TRACK_FIELDS, normalizeSiteConfig, type SiteConfig } from "../site-config";

type StudioTab = BalanceGroup | "music" | "design";
const TAB_COPY: Record<StudioTab, { label: string; description: string }> = {
  meteor: { label: "ゲーム", description: "メテオ数・追加移動・真剣タイマンの収束周期" },
  item: { label: "アイテム", description: "持込数・継続巡・効果範囲" },
  ai: { label: "AI", description: "前進・妨害・資源管理・後退・多様性" },
  music: { label: "音楽", description: "BGM・SE・4曲×5ステムの読込先" },
  design: { label: "デザイン", description: "色・発光・パネル濃度を公開後も変更" },
};

export default function BalancePage() {
  const [tab, setTab] = useState<StudioTab>("meteor");
  const [draft, setDraft] = useState<BalanceConfig>(DEFAULT_BALANCE);
  const [siteDraft, setSiteDraft] = useState<SiteConfig>(DEFAULT_SITE_CONFIG);
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [adminToken, setAdminToken] = useState("");
  const [loginMessage, setLoginMessage] = useState("管理トークンを入力してください");
  const [revision, setRevision] = useState(0);
  const [siteRevision, setSiteRevision] = useState(0);
  const [message, setMessage] = useState("読み込み中…");
  const [siteMessage, setSiteMessage] = useState("読み込み中…");
  const fileRef = useRef<HTMLInputElement>(null);
  const previewAudio = useRef<HTMLAudioElement | null>(null);
  const warnings = balanceWarnings(draft);
  const visibleBalanceFields = useMemo(() => BALANCE_FIELDS.filter((field) => field.group === tab), [tab]);

  const authHeaders = (token = adminToken) => token ? { authorization: `Bearer ${token}` } : undefined;
  const load = async (token = adminToken) => {
    const headers = authHeaders(token);
    const [balanceResponse, siteResponse] = await Promise.all([fetch("/api/admin-proxy?resource=balance&draft=1", { cache: "no-store", headers }), fetch("/api/admin-proxy?resource=site-config&draft=1", { cache: "no-store", headers })]);
    const [balanceData, siteData] = await Promise.all([balanceResponse.json(), siteResponse.json()]);
    const authenticated = balanceResponse.ok && siteResponse.ok && Boolean(balanceData.admin) && Boolean(siteData.admin);
    setAdmin(authenticated);
    if (authenticated) {
      sessionStorage.setItem("meteor-race-admin-token", token);
      setLoginMessage("");
    } else if (token) setLoginMessage("管理トークンが違います");
    if (balanceResponse.ok) { setDraft(normalizeBalance(balanceData.draft)); setRevision(balanceData.revision ?? 0); setMessage("下書きを編集中"); }
    else setMessage(balanceData.error ?? "管理者として読み込めませんでした");
    if (siteResponse.ok) { setSiteDraft(normalizeSiteConfig(siteData.draft)); setSiteRevision(siteData.revision ?? 0); setSiteMessage("下書きを編集中"); }
    else setSiteMessage(siteData.error ?? "管理者として読み込めませんでした");
  };

  useEffect(() => {
    // Loading the external D1 draft is the synchronization purpose of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    const savedToken = sessionStorage.getItem("meteor-race-admin-token") ?? "";
    setAdminToken(savedToken);
    void load(savedToken);
    return () => previewAudio.current?.pause();
  }, []);

  const postBalance = async (action: string, balance?: BalanceConfig) => {
    setMessage("保存中…");
    const response = await fetch("/api/admin-proxy?resource=balance", { method: "POST", headers: { "content-type": "application/json", ...authHeaders() }, body: JSON.stringify({ action, balance }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "更新できませんでした");
    setRevision(data.revision ?? revision);
    if (data.balance) setDraft(normalizeBalance(data.balance));
    setMessage(action === "publish" ? "公開済み。進行中の試合は固定値のままです" : action === "rollback" ? "直前の公開値へ復元しました" : "下書きを保存しました");
  };

  const postSite = async (action: string, config?: SiteConfig) => {
    setSiteMessage("保存中…");
    const response = await fetch("/api/admin-proxy?resource=site-config", { method: "POST", headers: { "content-type": "application/json", ...authHeaders() }, body: JSON.stringify({ action, config }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "更新できませんでした");
    setSiteRevision(data.revision ?? siteRevision);
    if (data.config) setSiteDraft(normalizeSiteConfig(data.config));
    setSiteMessage(action === "publish" ? "公開済み。再読み込み後から反映されます" : action === "rollback" ? "直前の公開値へ復元しました" : "下書きを保存しました");
  };

  const isBalanceTab = tab === "meteor" || tab === "item" || tab === "ai";
  const publishCurrent = async () => {
    if (!window.confirm(`${TAB_COPY[tab].label}の設定を公開しますか？`)) return;
    if (isBalanceTab) await postBalance("save_draft", draft).then(() => postBalance("publish"));
    else await postSite("save_draft", siteDraft).then(() => postSite("publish"));
  };
  const rollbackCurrent = async () => {
    if (!window.confirm("この分野を直前の公開値へ戻しますか？")) return;
    if (isBalanceTab) await postBalance("rollback"); else await postSite("rollback");
  };

  const exportBundle = () => {
    const blob = new Blob([JSON.stringify({ format: "meteor-race-operations-v1", exportedAt: new Date().toISOString(), balance: draft, site: siteDraft }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `meteor-race-settings-b${revision}-s${siteRevision}.json`; anchor.click(); URL.revokeObjectURL(url);
  };
  const importBundle = async (file: File) => {
    const data = JSON.parse(await file.text()) as { balance?: Partial<BalanceConfig>; site?: Partial<SiteConfig> };
    setDraft(normalizeBalance(data.balance)); setSiteDraft(normalizeSiteConfig(data.site));
    setMessage("バックアップを下書きへ読み込みました（未公開）"); setSiteMessage("バックアップを下書きへ読み込みました（未公開）");
  };
  const previewTrack = (value: string, folder = false) => {
    previewAudio.current?.pause(); const url = value.trim(); if (!url) return;
    const audio = new Audio(folder ? `${url.replace(/\/?$/, "/")}base.ogg` : url); audio.volume = 0.55; previewAudio.current = audio;
    void audio.play().catch(() => setSiteMessage("音源を再生できません。URL・形式・CORS設定を確認してください"));
  };

  if (admin === false) return <main className="balance-admin admin-login"><section><small>METEOR RACE / ADMIN</small><h1>OPERATIONS STUDIO</h1><p>ゲームバランス・AI・音楽・デザインを管理します。</p><label>管理トークン<input type="password" autoComplete="current-password" value={adminToken} onChange={(event) => setAdminToken(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void load(adminToken)} /></label><button type="button" disabled={!adminToken} onClick={() => void load(adminToken)}>管理画面へ入る</button><p role="status">{loginMessage}</p><Link href="/">ゲームへ戻る</Link></section></main>;

  return <main className="balance-admin">
    <header><div><small>METEOR RACE / ADMIN</small><h1>OPERATIONS STUDIO</h1><p>{TAB_COPY[tab].description}</p></div><div className="studio-header-status"><span>BALANCE r{revision}</span><span>SITE r{siteRevision}</span><button type="button" onClick={() => { sessionStorage.removeItem("meteor-race-admin-token"); setAdminToken(""); setAdmin(false); setLoginMessage("ログアウトしました"); }}>ログアウト</button><Link href="/">ゲームへ戻る</Link></div></header>
    <nav className="balance-tabs" aria-label="編集する分野">{(Object.keys(TAB_COPY) as StudioTab[]).map((key) => <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{TAB_COPY[key].label}</button>)}</nav>
    <section className="studio-toolbar"><div><b>{isBalanceTab ? message : siteMessage}</b><small>変更は下書き保存だけでは公開されません</small></div><button onClick={() => void (isBalanceTab ? postBalance("save_draft", draft) : postSite("save_draft", siteDraft))}>下書き保存</button>{isBalanceTab && <button onClick={() => void postBalance("save_draft", draft).then(() => window.open("/?balance=draft", "_blank"))}>AILABで試す</button>}<button className="publish" onClick={() => void publishCurrent()}>公開する</button><button className="rollback" onClick={() => void rollbackCurrent()}>直前版へ戻す</button><button onClick={exportBundle}>全設定バックアップ</button><button onClick={() => fileRef.current?.click()}>バックアップ読込</button><input ref={fileRef} hidden type="file" accept=".json,application/json" onChange={(event) => event.target.files?.[0] && void importBundle(event.target.files[0])}/></section>

    {isBalanceTab && <aside className={`balance-safety ${warnings.length ? "warning" : "safe"}`}><b>{warnings.length ? `公開前の注意 ${warnings.length}件` : "安全確認：重大な数値警告なし"}</b>{warnings.length > 0 && <ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}</aside>}
    {tab === "ai" && <section className="studio-presets"><header><b>安全プリセット</b><span>選択後も各数値を微調整できます</span></header>{Object.entries(AI_PRESETS).map(([key, preset]) => <button key={key} onClick={() => setDraft(normalizeBalance({ ...draft, ...preset.values }))}><strong>{preset.label}</strong><small>{preset.description}</small></button>)}</section>}
    {isBalanceTab && <section className="balance-grid" aria-label={`${TAB_COPY[tab].label}の調整値`}>{visibleBalanceFields.map((field) => <label key={field.key}><span><b>{field.label}</b><code>{field.externalKey}</code></span><input type="number" min={field.min} max={field.max} value={draft[field.key]} onChange={(event) => setDraft(normalizeBalance({ ...draft, [field.key]: Number(event.target.value) }))}/><i>{field.unit} / {field.min}～{field.max}</i></label>)}</section>}

    {tab === "music" && <><section className="balance-grid">{SITE_CONFIG_TOGGLE_FIELDS.filter((field) => field.key === "musicEnabled" || field.key === "musicCrossfadeMs" || field.key === "musicBpm").map((field) => <label key={field.key}><span><b>{field.label}</b><code>{field.externalKey}</code></span>{field.max === 1 ? <input className="studio-toggle" type="checkbox" checked={Boolean(siteDraft[field.key])} onChange={(event) => setSiteDraft(normalizeSiteConfig({ ...siteDraft, [field.key]: event.target.checked ? 1 : 0 }))}/> : <input type="number" min={field.min} max={field.max} value={siteDraft[field.key]} onChange={(event) => setSiteDraft(normalizeSiteConfig({ ...siteDraft, [field.key]: Number(event.target.value) }))}/>}<i>{field.unit}</i></label>)}</section><section className="site-tracks">{SITE_CONFIG_TRACK_FIELDS.map((field, index) => { const value = String(siteDraft[field.key]); const folder = index >= 4; return <label key={field.key}><span><b>{field.label}</b><code>{field.externalKey}</code></span><input type="text" placeholder={folder ? "/music/battle/meteor/ のように入力" : "空欄なら自動生成音"} value={value} onChange={(event) => setSiteDraft(normalizeSiteConfig({ ...siteDraft, [field.key]: event.target.value }))}/><button type="button" disabled={!value} onClick={() => previewTrack(value, folder)}>試聴</button></label>; })}</section><aside className="balance-note"><b>5ステム音源</b><p>各フォルダに base.ogg / pulse.ogg / rhythm.ogg / tension.ogg / final.ogg を置きます。試聴はbase.oggを再生します。空欄にすると自動生成BGMへ戻ります。</p></aside></>}

    {tab === "design" && <div className="design-studio"><section className="theme-controls">{SITE_CONFIG_THEME_COLOR_FIELDS.map((field) => <label key={field.key}><span><b>{field.label}</b><code>{field.externalKey}</code></span><input type="color" value={String(siteDraft[field.key])} onChange={(event) => setSiteDraft(normalizeSiteConfig({ ...siteDraft, [field.key]: event.target.value }))}/><input type="text" value={String(siteDraft[field.key])} onChange={(event) => setSiteDraft(normalizeSiteConfig({ ...siteDraft, [field.key]: event.target.value }))}/></label>)}{SITE_CONFIG_THEME_NUMBER_FIELDS.map((field) => <label key={field.key}><span><b>{field.label}</b><code>{field.externalKey}</code></span><input type="range" min={field.min} max={field.max} value={Number(siteDraft[field.key])} onChange={(event) => setSiteDraft(normalizeSiteConfig({ ...siteDraft, [field.key]: Number(event.target.value) }))}/><output>{siteDraft[field.key]}{field.unit}</output></label>)}{SITE_CONFIG_TOGGLE_FIELDS.filter((field) => field.key === "adsEnabled" || field.key === "adSlotTitle" || field.key === "adSlotResult" || field.key === "adSlotSettings").map((field) => <label key={field.key}><span><b>{field.label}</b><code>{field.externalKey}</code></span><input className="studio-toggle" type="checkbox" checked={Boolean(siteDraft[field.key])} onChange={(event) => setSiteDraft(normalizeSiteConfig({ ...siteDraft, [field.key]: event.target.checked ? 1 : 0 }))}/><output>{siteDraft[field.key] ? "ON" : "OFF"}</output></label>)}</section><section className="theme-preview" style={{ "--preview-accent": siteDraft.themeAccent, "--preview-warm": siteDraft.themeWarm, "--preview-bg": siteDraft.themeBackground, "--preview-text": siteDraft.themeText, "--preview-glow": siteDraft.themeGlow / 100, "--preview-panel": siteDraft.themePanelOpacity / 100 } as CSSProperties}><small>LIVE PREVIEW</small><h2>METEOR <span>RACE</span></h2><div><b>CURRENT TURN</b><strong>RED</strong></div><button>GAME START</button><p>公開前に色・発光・読みやすさを確認できます。</p></section></div>}
  </main>;
}
