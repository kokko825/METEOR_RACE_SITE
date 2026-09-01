import type { Metadata } from "next";
import Link from "next/link";
import { RELEASE_NOTES } from "../../config/release-notes";

export const metadata: Metadata = { title:"更新履歴 | METEOR RACE", description:"METEOR RACEの機能追加・改善・不具合修正の履歴です。" };

export default function UpdatesPage() {
  return <main className="release-page">
    <header className="release-page-header"><Link href="/">← METEOR RACE</Link><small>AEQRIS // RELEASE ARCHIVE</small><h1>更新履歴</h1><p>機能追加、改善、不具合修正の記録。</p></header>
    <ol className="release-history">{RELEASE_NOTES.map((note,index) => <li key={note.version} className={index===0?"latest":undefined}>
      <div className="release-version"><b>Version {note.version}</b><time dateTime={note.date}>{note.date}</time></div>
      <div className="release-detail"><div className="release-tags">{note.tags.map((tag)=><span key={tag}>{tag}</span>)}</div><h2>{note.title.ja}</h2><p>{note.summary.ja}</p><ul>{note.details.ja.map((detail)=><li key={detail}>{detail}</li>)}</ul></div>
    </li>)}</ol>
    <footer><Link href="/">ゲームへ戻る</Link><span>METEOR RACE // FOLLNEST</span></footer>
  </main>;
}
