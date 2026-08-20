import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "利用規約",
  description: "METEOR RACEの利用条件について説明します。",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <main className="doc-page">
      <div className="doc-topbar"><a className="doc-back" href="/">← 戻る</a></div>
      <header className="doc-header"><small>TERMS OF USE</small><h1>利用規約</h1><p className="doc-lead">楽しく公平な対戦環境を守るための基本ルールです。</p></header>
      <section className="doc-section"><h2>利用条件</h2><p>本サービスは無料で利用できます。通信環境や対応ブラウザによって、一部機能が利用できない場合があります。</p></section>
      <section className="doc-section"><h2>禁止事項</h2><p>不正な通信、レートや対戦結果の改ざん、他の利用者への迷惑行為、サービスへ過度な負荷を与える行為、権利を侵害する内容の送信を禁止します。</p></section>
      <section className="doc-section"><h2>対戦とデータ</h2><p>通信切断や障害により、対戦が中断されたり結果が反映されなかったりする場合があります。不具合を見つけた場合はゲーム内フォームからお知らせください。</p></section>
      <section className="doc-section"><h2>変更と停止</h2><p>ゲームバランス、開催時間、提供機能、本規約は、品質維持のため変更することがあります。保守や障害対応のため一時的にサービスを停止する場合があります。</p></section>
      <section className="doc-section"><h2>免責</h2><p>法令上認められる範囲で、本サービスの利用または利用不能によって生じた間接的な損害について責任を負いません。</p></section>
      <p className="doc-updated">制定日：2026年8月20日</p>
    </main>
  );
}
