"use client";
import Link from "next/link";
import { RELEASE_NOTES } from "../../config/release-notes";
import { useLocalSettings } from "../hooks/use-local-settings";

export function UpdatesClient() {
  const { language } = useLocalSettings();
  const ja = language === "ja";
  return <main className="release-page" lang={language}>
    <header className="release-page-header"><Link href="/">← METEOR RACE</Link><small>AEQRIS // RELEASE ARCHIVE</small><h1>{ja ? "更新履歴" : "UPDATE LOG"}</h1><p>{ja ? "機能追加、改善、不具合修正の記録。" : "A record of new features, refinements, and fixes."}</p></header>
    <ol className="release-history">{RELEASE_NOTES.map((note,index) => <li key={note.version} className={index===0?"latest":undefined}><div className="release-version"><b>Version {note.version}</b><time dateTime={note.date}>{note.date}</time></div><div className="release-detail"><div className="release-tags">{note.tags.map((tag)=><span key={tag}>{tag}</span>)}</div><h2>{note.title[language]}</h2><p>{note.summary[language]}</p><ul>{note.details[language].map((detail)=><li key={detail}>{detail}</li>)}</ul></div></li>)}</ol>
    <footer><Link href="/">{ja ? "ゲームへ戻る" : "RETURN TO GAME"}</Link><span>METEOR RACE // FOLLNEST</span></footer>
  </main>;
}
