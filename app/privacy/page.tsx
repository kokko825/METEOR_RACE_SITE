import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "プライバシーポリシー",
  description: "METEOR RACEで取り扱う情報と利用目的について説明します。",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <main className="doc-page">
      <div className="doc-topbar"><Link className="doc-back" href="/">← 戻る</Link></div>
      <header className="doc-header"><small>PRIVACY POLICY</small><h1>プライバシーポリシー</h1><p className="doc-lead">METEOR RACEは、遊ぶために必要な情報だけを取り扱います。</p></header>
      <section className="doc-section"><h2>保存する情報</h2><p>ニックネーム、端末ごとに発行するPLAYER ID、対戦結果、レート、ルーム参加情報、お問い合わせ内容を保存することがあります。メールアドレスの登録はありません。</p></section>
      <section className="doc-section"><h2>利用目的</h2><p>オンライン対戦の同期、本人のプロフィールとレートの識別、不具合調査、お問い合わせ対応、ゲーム品質の改善に利用します。</p></section>
      <section className="doc-section"><h2>公開範囲</h2><p>他のプレイヤーに表示するのは対戦用ニックネームなど、ゲームに必要な情報だけです。内部のPLAYER IDは公開しません。</p></section>
      <section className="doc-section"><h2>端末への保存</h2><p>設定やPLAYER IDはブラウザのローカルストレージにも保存されます。ブラウザのデータを消去すると、端末内の情報が失われる場合があります。</p></section>
      <section className="doc-section"><h2>お問い合わせ</h2><p>削除依頼や質問は、ゲーム内のSETTINGSにあるお問い合わせフォームから送信してください。</p></section>
      <p className="doc-updated">制定日：2026年8月20日</p>
    </main>
  );
}
