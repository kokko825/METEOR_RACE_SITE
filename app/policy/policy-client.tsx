"use client";
import Link from "next/link";
import { useLocalSettings } from "../hooks/use-local-settings";

const EN_SECTIONS = [
  ["PRIVACY", "We may store your nickname, device identifier and shorter AEQRIS company registration number, match results, rating, room participation, room chat, and contact messages. This information is used for online synchronization, support, issue investigation, and game improvement. Google Analytics is used to understand service usage."],
  ["ANONYMOUS STRONG-PLAY DATA", "When enabled, selected high-impact positions played by a winner may be stored for manual AI evaluation. Nicknames, email, chat, registration numbers, and room codes are excluded. This is not automatic AI training and can be disabled at any time."],
  ["VISIBILITY & DEVICE STORAGE", "Only information needed for play, such as your match nickname, is shown to other players. Settings and the company registration number are stored in your browser and may be lost if browser data is cleared."],
  ["CHAT & RETENTION", "Room chat is visible to participants. Abusive, discriminatory, and sexually explicit messages are restricted. Chat is retained for up to 30 days, contact messages generally for 180 days, and anonymous strong-play data for up to 90 days."],
  ["CONDITIONS & PROHIBITED CONDUCT", "The service is free to use. Unauthorized communication, result tampering, impersonation, harassment, threats, discrimination, sexual misconduct, posting personal information, excessive load, and infringement of third-party rights are prohibited."],
  ["MATCHES, CHANGES & DISCLAIMER", "Connections or service failures may interrupt matches. Game content and this policy may change to maintain quality, and the service may be temporarily suspended for maintenance. To the extent permitted by law, we are not liable for indirect loss caused by use or inability to use the service."],
  ["ITEM IDEA SUBMISSIONS", "Submit only ideas you created. Submissions may be reviewed, balanced, modified, adopted, and published without payment to fit the game and its world. Adoption, compensation, and name credit are not guaranteed."],
  ["CONTACT", "Send deletion requests, bug reports, and questions through the Contact form in in-game SETTINGS."],
] as const;

export function PolicyClient({ japanese }: { japanese: React.ReactNode }) {
  const { language } = useLocalSettings();
  if (language === "ja") return japanese;
  return <main className="doc-page" lang="en"><div className="doc-topbar"><Link className="doc-back" href="/">← BACK</Link></div><header className="doc-header"><small>TERMS &amp; PRIVACY</small><h1>TERMS &amp; PRIVACY</h1><p className="doc-lead">Terms for fair and enjoyable play, and details about how information is handled.</p></header>{EN_SECTIONS.map(([title, body], index)=><section className="doc-section" id={index===6?"submissions":undefined} key={title}><h2>{title}</h2><p>{body}</p></section>)}<p className="doc-updated">Established: August 20, 2026 · Last updated: September 7, 2026</p></main>;
}
