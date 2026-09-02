import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "サイトポリシー",
  description: "METEOR RACEのプライバシー方針と利用条件です。",
  alternates: { canonical: "/policy" },
};

export default function PolicyPage() {
  return <main className="doc-page">
    <div className="doc-topbar"><Link className="doc-back" href="/">← 戻る</Link></div>
    <header className="doc-header"><small>SITE POLICY</small><h1>サイトポリシー</h1><p className="doc-lead">取り扱う情報と、楽しく公平に遊ぶための利用条件をまとめています。</p></header>
    <section className="doc-section"><h2>プライバシー方針</h2><h3>保存する情報</h3><p>ニックネーム、端末ごとの内部識別子と、それから作る短いAEQRIS企業登録番号、対戦結果、レート、ルーム参加情報、ルームチャット、お問い合わせ内容を保存することがあります。認証サービスと連携した場合に限り、識別と問い合わせ通知のためメールアドレスを取り扱う場合があります。</p><h3>利用目的</h3><p>オンライン対戦の同期、プロフィールとレートの識別、不具合調査、お問い合わせ対応、ゲーム品質の改善に利用します。</p></section>
    <section className="doc-section"><h2>匿名の好プレーデータ</h2><p>設定がONの場合、CPUを含む対戦で勝者が行った有効性の高い局面をAI改善の検証資料として保存することがあります。ニックネーム、メールアドレス、チャット、企業登録番号、ルームコードは含めません。AIの自動学習には使用せず、設定からいつでもOFFにできます。</p></section>
    <section className="doc-section"><h2>公開範囲と端末保存</h2><p>他のプレイヤーに表示するのは対戦用ニックネームなど必要な情報だけです。設定と企業登録番号はブラウザにも保存され、ブラウザデータを消去すると失われる場合があります。</p></section>
    <section className="doc-section"><h2>チャットと保存期間</h2><p>ルームチャットは参加者間で表示されます。暴言、差別的表現、性的な表現などは送信を制限します。チャットは最長30日、お問い合わせは原則180日、匿名の好プレーデータは最長90日を目安に削除します。</p></section>
    <section className="doc-section"><h2>利用条件と禁止事項</h2><p>本サービスは無料で利用できます。不正な通信、結果の改ざん、なりすまし、嫌がらせ・脅迫・差別・性的な迷惑行為、個人情報の投稿、過度な負荷、第三者の権利を侵害する行為を禁止します。</p></section>
    <section className="doc-section"><h2>対戦・変更・免責</h2><p>通信切断や障害により対戦が中断される場合があります。品質維持のためゲーム内容や本ポリシーを変更し、保守のため一時停止することがあります。法令上認められる範囲で、利用または利用不能による間接的な損害について責任を負いません。</p></section>
    <section className="doc-section" id="submissions"><h2>アイテム案の投稿</h2><p>自身が考案した内容のみを送信してください。投稿案はゲームバランスや世界観に合わせ、無償で検討・調整・改変・採用・公開できるものとします。採用、報酬、名前掲載を保証するものではありません。</p></section>
    <section className="doc-section"><h2>お問い合わせ</h2><p>削除依頼、不具合、質問はゲーム内SETTINGSのお問い合わせフォームから送信してください。</p></section>
    <p className="doc-updated">制定日：2026年8月20日　最終更新：2026年9月2日</p>
  </main>;
}
