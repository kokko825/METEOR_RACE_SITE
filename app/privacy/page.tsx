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
      <section className="doc-section"><h2>保存する情報</h2><p>ニックネーム、端末ごとに発行するREGULA企業登録番号（内部識別子）、対戦結果、レート、ルーム参加情報、ルームチャット、お問い合わせ内容を保存することがあります。認証サービスと連携した場合に限り、識別と問い合わせ通知のためメールアドレスを取り扱う場合があります。</p></section>
      <section className="doc-section"><h2>利用目的</h2><p>オンライン対戦の同期、本人のプロフィールとレートの識別、不具合調査、お問い合わせ対応、ゲーム品質の改善に利用します。</p></section>
      <section className="doc-section"><h2>匿名の好プレーデータ</h2><p>設定がONの場合、CPUを含む対戦で勝者が行った有効性の高い局面を、AI改善の検証資料として保存することがあります。盤面、モード、難易度、行動前後の状態を保存しますが、ニックネーム、メールアドレス、チャット、REGULA企業登録番号、ルームコードは含めず、別の対戦と同一企業として結び付けません。保存前にサーバー側で評価を再計算し、改変された値は受け付けません。AIが自動学習するためには使用せず、設定からいつでもOFFにできます。</p></section>
      <section className="doc-section"><h2>公開範囲</h2><p>他のプレイヤーに表示するのは対戦用ニックネームなど、ゲームに必要な情報だけです。内部のREGULA企業登録番号は公開しません。</p></section>
      <section className="doc-section"><h2>端末への保存</h2><p>設定やREGULA企業登録番号はブラウザのローカルストレージにも保存されます。ブラウザのデータを消去すると、端末内の情報が失われる場合があります。</p></section>
      <section className="doc-section"><h2>チャットと安全対策</h2><p>ルームチャットは参加者間で表示され、迷惑行為の防止と調査のため直近の履歴を最長30日間保存します。暴言、差別的表現、性的な表現などは自動判定で送信を制限します。過剰なアクセスの防止には、IPアドレスそのものではなく一方向変換した一時識別子を使用します。</p></section>
      <section className="doc-section"><h2>保存期間</h2><p>チャットは最長30日、お問い合わせは原則180日、匿名の好プレーデータは最長90日を目安に自動削除します。法令対応、不正利用調査、紛争対応に必要な場合は、その目的に必要な期間に限り保存することがあります。</p></section>
      <section className="doc-section"><h2>お問い合わせ</h2><p>削除依頼や質問は、ゲーム内のSETTINGSにあるお問い合わせフォームから送信してください。</p></section>
      <p className="doc-updated">制定日：2026年8月20日　最終更新：2026年8月27日</p>
    </main>
  );
}
