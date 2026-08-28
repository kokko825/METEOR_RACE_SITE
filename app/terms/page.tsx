import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "利用規約",
  description: "METEOR RACEの利用条件について説明します。",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <main className="doc-page">
      <div className="doc-topbar"><Link className="doc-back" href="/">← 戻る</Link></div>
      <header className="doc-header"><small>TERMS OF USE</small><h1>利用規約</h1><p className="doc-lead">楽しく公平な対戦環境を守るための基本ルールです。</p></header>
      <section className="doc-section"><h2>利用条件</h2><p>本サービスは無料で利用できます。通信環境や対応ブラウザによって、一部機能が利用できない場合があります。</p></section>
      <section className="doc-section"><h2>禁止事項</h2><p>不正な通信、レートや対戦結果の改ざん、なりすまし、他の利用者への嫌がらせ・脅迫・差別・性的な迷惑行為、個人情報の投稿、サービスへ過度な負荷を与える行為、第三者の権利を侵害する内容の送信を禁止します。</p></section>
      <section className="doc-section"><h2>チャットの利用</h2><p>チャットには個人情報や秘密情報を投稿しないでください。不適切な表現は自動的に拒否される場合があります。安全な対戦環境の維持に必要な場合、機能制限やデータ確認を行うことがあります。</p></section>
      <section className="doc-section"><h2>対戦とデータ</h2><p>通信切断や障害により、対戦が中断されたり結果が反映されなかったりする場合があります。不具合を見つけた場合はゲーム内フォームからお知らせください。</p></section>
      <section className="doc-section"><h2>アイテム案の投稿</h2><p>投稿者は、自身が考案した内容のみを送信してください。投稿されたアイデアは、ゲームバランスや世界観に合わせて無償で検討・調整・改変・採用・公開できるものとします。投稿によって著作権の譲渡を求めるものではありませんが、採用や報酬、名前掲載を保証するものではありません。第三者の作品、秘密情報、個人情報を含む内容は送信しないでください。</p></section>
      <section className="doc-section"><h2>変更と停止</h2><p>ゲームバランス、開催時間、提供機能、本規約は、品質維持のため変更することがあります。保守や障害対応のため一時的にサービスを停止する場合があります。</p></section>
      <section className="doc-section"><h2>免責</h2><p>法令上認められる範囲で、本サービスの利用または利用不能によって生じた間接的な損害について責任を負いません。</p></section>
      <p className="doc-updated">制定日：2026年8月20日　最終更新：2026年8月28日</p>
    </main>
  );
}
