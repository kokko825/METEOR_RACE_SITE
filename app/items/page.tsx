import type { Metadata } from "next";
import { SITE_URL } from "../site-url";
import { getPublishedBalance } from "../published-balance";
import {
  SELECTABLE_ITEMS,
  ITEM_ICONS,
  ITEM_TACTICS,
  itemDetail,
  itemEffectFacts,
} from "../item-content";

export const metadata: Metadata = {
  title: "アイテム一覧・効果解説",
  description:
    "メテオレース（METEOR RACE）に登場する全アイテムの効果と使いどころを解説します。SHIELD・BOOSTER・HOLO・ORBIT・BLAST・PULSE・RECALLの7種類と、ランク戦のORBITAL GRAVITYまで網羅しています。",
  alternates: { canonical: "/items" },
  openGraph: {
    type: "article",
    url: `${SITE_URL}/items`,
    title: "メテオレース アイテム一覧・効果解説",
    description:
      "SHIELD・BOOSTER・HOLO・ORBIT・BLAST・PULSE・RECALLの7種類のアイテム効果と使いどころを解説します。",
  },
};

const BREADCRUMB = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "METEOR RACE", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "アイテム一覧", item: `${SITE_URL}/items` },
  ],
};

export default async function ItemsPage() {
  const balance = await getPublishedBalance();

  return (
    <main className="doc-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB) }} />

      <nav className="doc-breadcrumb" aria-label="パンくずリスト">
        <a href="/">METEOR RACE</a> <span aria-hidden="true">›</span> <span>アイテム一覧</span>
      </nav>

      <header className="doc-header">
        <small>ITEM LIST</small>
        <h1>メテオレース アイテム一覧</h1>
        <p className="doc-lead">
          ITEMルールでは、対戦前にアイテムを{balance.itemHandTotal}個選んで持ち込みます。同じ種類は{balance.itemSameMax}個まで。
          対戦中は探査機を移動したあと、メテオを置く代わりにアイテムを1個使えます。
          ここでは全{SELECTABLE_ITEMS.length}種類の効果と使いどころをまとめています。
        </p>
      </header>

      <section className="doc-section">
        <h2>持ち込みアイテム（全{SELECTABLE_ITEMS.length}種類）</h2>
        <div className="doc-items">
          {SELECTABLE_ITEMS.map((kind) => {
            const [range, effect] = itemEffectFacts(kind, balance);
            return (
              <article key={kind} className="doc-item" id={kind}>
                <h3>
                  <i className={`item-icon ${kind}`} aria-hidden="true">{ITEM_ICONS[kind]}</i>
                  {kind.toUpperCase()}
                </h3>
                <p className="doc-item-effect">{itemDetail(kind, balance)}</p>
                <ul className="doc-item-facts">
                  <li>{range}</li>
                  <li>{effect}</li>
                </ul>
                <p className="doc-item-tactics"><b>使いどころ</b>{ITEM_TACTICS[kind]}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="doc-section">
        <h2>ORBITAL GRAVITY（真剣タイマン限定）</h2>
        <p>
          持ち込むアイテムではなく、ランク戦で自動的に発生するイベントです。
          {itemDetail("gravity", balance)}
        </p>
      </section>

      <nav className="doc-next">
        <a className="doc-cta" href="/">ゲームを始める</a>
        <a href="/guide">遊び方・ルールを見る</a>
      </nav>
    </main>
  );
}
