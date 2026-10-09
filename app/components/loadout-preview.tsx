"use client";

import { useState } from "react";
import type { BalanceConfig } from "../balance-config";
import type { ItemKind } from "../game-rules";
import { itemDetail, itemEffectFacts, ITEM_ROLES } from "../item-content";
import { ItemIcon } from "./game-pieces";

/** Flags retain their identity; the selected flag gets one readable description. */
export function LoadoutPreview({ items, balance, language }: {
  items: ItemKind[]; balance: BalanceConfig; language: "ja" | "en";
}) {
  const [selected, setSelected] = useState(Math.max(0, items.length - 1));
  const index = Math.min(selected, Math.max(0, items.length - 1));
  const kind = items[index];
  return <div className="item-selection-overlay readable-loadout">
    <header><strong>{language === "ja" ? "持ち込むアイテム" : "YOUR LOADOUT"}</strong></header>
    <div className={`item-preview-flags count-${Math.min(3, items.length)}`}>
      {!items.length && <p>{language === "ja" ? "下の一覧から選んでください。選んだ旗を押すと効果を確認できます。" : "Choose below. Select a flag to read its effect."}</p>}
      {items.map((item, i) => <button type="button" key={`${item}-${i}`} className={`item-preview-flag ${item}${i === index ? " selected" : ""}`} aria-pressed={i === index} onClick={() => setSelected(i)}>
        <ItemIcon kind={item} /><b>{item.toUpperCase()}</b><span className="loadout-slot">{i + 1}</span>
        <span className="loadout-card-facts">{itemEffectFacts(item, balance, language)[0]}</span>
        <span className="loadout-card-description">{itemDetail(item, balance, language)}</span>
      </button>)}
    </div>
    {kind && <section className={`loadout-detail ${kind}`} aria-live="polite">
      <strong>{kind.toUpperCase()} · {itemEffectFacts(kind, balance, language)[0]}</strong>
      <p className="item-role">{ITEM_ROLES[kind][language]}</p>
      <p>{itemDetail(kind, balance, language)}</p>
    </section>}
  </div>;
}
