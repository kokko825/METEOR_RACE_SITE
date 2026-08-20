import type { Metadata } from "next";
import { SITE_URL } from "../site-url";
import { getPublishedBalance } from "../published-balance";

export const metadata: Metadata = {
  title: "遊び方・ルール解説",
  description:
    "メテオレース（METEOR RACE）のルールを解説します。探査機の移動、メテオの配置、爆風による吹き飛ばし、COREへの到達条件、CLASSIC・ITEM・チーム戦・真剣タイマンの違いまで、初めての人向けにまとめました。",
  alternates: { canonical: "/guide" },
  openGraph: {
    type: "article",
    url: `${SITE_URL}/guide`,
    title: "メテオレースの遊び方・ルール解説",
    description:
      "探査機の移動、メテオの配置、爆風による吹き飛ばし、COREへの到達条件まで、メテオレースのルールを初めての人向けに解説します。",
  },
};

const BREADCRUMB = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "METEOR RACE", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "遊び方・ルール解説", item: `${SITE_URL}/guide` },
  ],
};

export default async function GuidePage() {
  const balance = await getPublishedBalance();

  return (
    <main className="doc-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB) }} />

      <div className="doc-topbar">
        <a className="doc-back" href="/">← 戻る</a>
        <nav className="doc-breadcrumb" aria-label="パンくずリスト">
          <a href="/">METEOR RACE</a> <span aria-hidden="true">›</span> <span>遊び方</span>
        </nav>
      </div>

      <header className="doc-header">
        <small>HOW TO PLAY</small>
        <h1>メテオレースの遊び方</h1>
        <p className="doc-lead">
          メテオレース（METEOR RACE）は、隕石の爆風を利用して探査機を盤面中央のCOREへ進める、2〜4人用のターン制戦略ボードゲームです。
          爆風は避けるべき障害ではなく、自分を一気に前進させる推進力にもなります。この駆け引きがゲームの中心です。
        </p>
      </header>

      <section className="doc-section">
        <h2>勝利条件</h2>
        <p>
          盤面中央のCOREへ最初に到達したプレイヤーの勝ちです。到達手段は問いません。
          自分の移動で入っても、爆風で吹き飛ばされて入っても、BOOSTERで飛び込んでも、ORBITAL GRAVITYで引き寄せられて入っても、すべて勝利になります。
        </p>
      </section>

      <section className="doc-section">
        <h2>1ターンの流れ</h2>
        <ol className="doc-steps">
          <li>
            <b>01 / MOVE — 移動</b>
            <p>
              探査機を縦か横へ1マス動かします。斜めには進めません。移動は必須で、どこにも動けないときだけ省略できます。
              後退もできますが、COREへ近づく進路を作るほうが有利です。
            </p>
          </li>
          <li>
            <b>02 / PLACE — メテオ配置</b>
            <p>
              移動したあと、手持ちのメテオを盤面に1個置きます。小メテオを{balance.meteorSmallStart}個、大メテオを{balance.meteorLargeStart}個持って始めます。
              先攻の最初の手番だけは配置できません。配置を見送るパスは、各プレイヤー1回だけ使えます。
            </p>
          </li>
          <li>
            <b>03 / METEOR — 爆風</b>
            <p>
              置いたメテオは爆発し、周囲の探査機を吹き飛ばします。小メテオは周囲1マス。大メテオは近い探査機を2マス、遠い探査機を1マス動かします。
              爆風は相手だけでなく自分も押すため、自分をCOREへ近づける踏み台としても使えます。
            </p>
          </li>
        </ol>
      </section>

      <section className="doc-section">
        <h2>ゲームモード</h2>
        <dl className="doc-defs">
          <dt>CLASSIC</dt>
          <dd>メテオの配置と爆風だけで戦う基本ルール。盤面は9×9または11×11です。</dd>

          <dt>ITEM</dt>
          <dd>
            対戦前にアイテムを{balance.itemHandTotal}個選んで持ち込みます。同じ種類は{balance.itemSameMax}個まで。
            移動後、メテオを置く代わりにアイテムを1個使えます。
            各アイテムの効果は<a href="/items">アイテム一覧</a>にまとめています。
          </dd>

          <dt>2 VS 2（チーム戦）</dt>
          <dd>REDとYELLOW、BLUEとGREENに分かれて戦います。盤面は13×13または15×15です。</dd>

          <dt>真剣タイマン（ランク戦）</dt>
          <dd>
            1対1専用のレート対戦。毎日8:00〜9:00と20:00〜21:00（日本時間）のみ参加できます。
            {balance.rankedGravityRounds}巡ごとにORBITAL GRAVITYが発動し、全探査機がCORE方向へ1マス引き寄せられるため、
            にらみ合いのまま長引くことがありません。レートはサーバー側で管理され、途中退出すると減点されます。
          </dd>
        </dl>
      </section>

      <section className="doc-section">
        <h2>ランク</h2>
        <p>
          IRON → BRONZE → SILVER → GOLD → PLATINUM → DIAMOND → ORBIT の順に上がります。
          真剣タイマンは1対1専用です。勝敗でレートが増減し、CLASSICとITEMのレートは別々に管理されます。
        </p>
      </section>

      <section className="doc-section">
        <h2>ひとりで遊ぶ・みんなで遊ぶ</h2>
        <p>
          CPU対戦（SINGLE）、同じ端末での対人戦（LOCAL）、通信対戦（ONLINE）から選べます。
          CPUの強さはEASY・NORMAL・HARDの3段階です。
          インストールも会員登録も不要で、ブラウザを開けばすぐ始められます。
        </p>
      </section>

      <nav className="doc-next">
        <a className="doc-cta" href="/">ゲームを始める</a>
        <a href="/items">アイテム一覧を見る</a>
      </nav>
    </main>
  );
}
