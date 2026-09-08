import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "../site-url";
import { getPublishedBalance } from "../published-balance";
import { LocalizedDocument } from "../components/localized-document";

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
    images: [],
  },
  twitter: {
    card: "summary",
    title: "メテオレースの遊び方・ルール解説",
    description: "探査機の移動、メテオ配置、爆風、COREへの到達条件を初心者向けに解説します。",
    images: [],
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

  const japanese = (
    <main className="doc-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB) }} />

      <div className="doc-topbar">
        <Link className="doc-back" href="/">← 戻る</Link>
        <nav className="doc-breadcrumb" aria-label="パンくずリスト">
          <Link href="/">METEOR RACE</Link> <span aria-hidden="true">›</span> <span>遊び方</span>
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
        <h2>メテオを使い切ったとき</h2>
        <p>
          手持ちの小メテオと大メテオをすべて使い切ると、その手番中にボーナス移動が発生し、探査機をもう1回動かせます。
          最後のメテオを自分の推進に使い、続けてCOREへ踏み込むこともできます。
        </p>
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
        <Link className="doc-cta" href="/">ゲームを始める</Link>
        <a href="/items">アイテム一覧を見る</a>
      </nav>
    </main>
  );
  const english = <main className="doc-page" lang="en">
    <div className="doc-topbar"><Link className="doc-back" href="/">← BACK</Link><nav className="doc-breadcrumb" aria-label="Breadcrumb"><Link href="/">METEOR RACE</Link> <span aria-hidden="true">›</span> <span>HOW TO PLAY</span></nav></div>
    <header className="doc-header"><small>HOW TO PLAY</small><h1>HOW TO PLAY METEOR RACE</h1><p className="doc-lead">METEOR RACE is a turn-based strategy board game for two to four players. Use meteor blasts to propel your probe toward the CORE. A blast is not only a hazard—it is also your fastest route forward.</p></header>
    <section className="doc-section"><h2>OBJECTIVE</h2><p>Be the first probe to enter the CORE at the center of the board. Normal movement, a blast, BOOSTER, or ORBITAL GRAVITY can all complete the race.</p></section>
    <section className="doc-section"><h2>TURN FLOW</h2><ol className="doc-steps"><li><b>01 / MOVE</b><p>Move one cell vertically or horizontally. Diagonal movement is not allowed. Movement is required unless every route is blocked.</p></li><li><b>02 / PLACE</b><p>After moving, place one of your {balance.meteorSmallStart} small or {balance.meteorLargeStart} large starting meteors. The first player cannot place a meteor on the opening turn. Each player may pass placement once.</p></li><li><b>03 / METEOR</b><p>A small meteor blasts its surrounding ring. A large meteor moves nearby probes two cells and the outer ring one cell. Blasts move your own probe as well as rivals.</p></li></ol></section>
    <section className="doc-section"><h2>LAST-METEOR BONUS</h2><p>After using every small and large meteor in your hand, you gain one bonus move during that turn. Your final meteor can propel you forward before you step into the CORE.</p></section>
    <section className="doc-section"><h2>GAME MODES</h2><dl className="doc-defs"><dt>CLASSIC</dt><dd>Core meteor rules on a 9×9 or 11×11 board.</dd><dt>ITEM</dt><dd>Bring {balance.itemHandTotal} items, with up to {balance.itemSameMax} of the same kind. After moving, use an item instead of placing a meteor. See the <a href="/items">item list</a>.</dd><dt>2 VS 2</dt><dd>RED and YELLOW face BLUE and GREEN on a 13×13 or 15×15 board.</dd><dt>RANKED DUEL</dt><dd>A rated 1 VS 1 match available daily from 8:00–9:00 and 20:00–21:00 JST. ORBITAL GRAVITY activates every {balance.rankedGravityRounds} rounds to prevent a permanent stalemate. Leaving early reduces your rating.</dd></dl></section>
    <section className="doc-section"><h2>RANKS</h2><p>IRON → BRONZE → SILVER → GOLD → PLATINUM → DIAMOND → ORBIT. CLASSIC and ITEM ratings are tracked separately.</p></section>
    <section className="doc-section"><h2>WAYS TO PLAY</h2><p>Choose SINGLE against CPUs, LOCAL on one device, or ONLINE. CPU difficulty is available in EASY, NORMAL, and HARD. No installation or account registration is required.</p></section>
    <nav className="doc-next"><Link className="doc-cta" href="/">START GAME</Link><a href="/items">VIEW ITEMS</a></nav>
  </main>;
  return <LocalizedDocument japanese={japanese} english={english} />;
}
