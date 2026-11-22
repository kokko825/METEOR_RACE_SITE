"use client";
import Link from "next/link";
import { RELEASE_NOTES } from "../../config/release-notes";
import { useSiteLanguage } from "../hooks/use-local-settings";

export function UpdatesClient() {
  const language = useSiteLanguage();
  const ja = language === "ja";
  const months = [...new Set(RELEASE_NOTES.map(note => note.date.slice(0, 7)))];
  return <main className="release-page" lang={language}>
    <header className="release-page-header"><Link href="/">← METEOR RACE</Link><small>AEQRIS // RELEASE ARCHIVE</small><h1>{ja ? "更新履歴" : "UPDATE LOG"}</h1><p>{ja ? "機能追加、改善、不具合修正の記録。" : "A record of new features, refinements, and fixes."}</p></header>
    <nav className="release-month-links" aria-label={ja ? "月を選ぶ" : "Choose a month"}>{months.map(month => <a key={month} href={`#month-${month}`}>{month}</a>)}</nav>
    {months.map(month => <section key={month} className="release-month" aria-labelledby={`month-${month}`}>
      <h2 id={`month-${month}`}>{month}</h2>
      <ol className="release-history">{RELEASE_NOTES.filter(note => note.date.startsWith(month)).map(note => <li key={note.version} id={`version-${note.version}`} className={note === RELEASE_NOTES[0] ? "latest" : undefined}>
        <div className="release-version"><a href={`#version-${note.version}`}>Version {note.version}</a>{note === RELEASE_NOTES[0] && <span className="release-latest">{ja ? "最新" : "Latest"}</span>}<time dateTime={note.date}>{note.date}</time></div>
        <div className="release-detail"><div className="release-tags">{note.tags.map(tag => <span key={tag}>{tag}</span>)}</div><h3>{note.title[language]}</h3><p>{note.summary[language]}</p><ul>{note.details[language].map(detail => <li key={detail}>{detail}</li>)}</ul></div>
      </li>)}</ol>
    </section>)}
    <footer><Link href="/">{ja ? "ゲームへ戻る" : "RETURN TO GAME"}</Link><span>METEOR RACE // FOLLNEST</span></footer>
  </main>;
}
