import type { BalanceConfig } from "../balance-config";
import type { ItemKind } from "../game-rules";
import { itemDetail, itemEffectFacts, ITEM_ROLES } from "../item-content";
import { ItemIcon } from "./game-pieces";

/** Horizontal equipment rows share an icon column and reveal optional detail inline. */
export function LoadoutPreview({ items, balance, language }: {
  items: ItemKind[]; balance: BalanceConfig; language: "ja" | "en";
}) {
  return <div className="item-selection-overlay readable-loadout">
    <header><strong>{language === "ja" ? "持ち込むアイテム" : "YOUR LOADOUT"}</strong></header>
    <div className="loadout-rows">
      {!items.length && <p className="loadout-empty">{language === "ja" ? "下の一覧から装備を選んでください。" : "Choose your equipment below."}</p>}
      {items.map((item, i) => <details key={`${item}-${i}`} className={`loadout-row ${item}`}>
        <summary>
          <span className="loadout-emblem"><ItemIcon kind={item} /><small>{String(i + 1).padStart(2, "0")}</small></span>
          <span className="loadout-copy">
            <span className="loadout-heading"><b>{item.toUpperCase()}</b><span>{itemEffectFacts(item, balance, language)[0]}</span></span>
            <span className="loadout-role">{ITEM_ROLES[item][language]}</span>
          </span>
          <span className="loadout-expand" aria-label={language === "ja" ? "詳細" : "Details"}>＋</span>
        </summary>
        <p className="loadout-card-description">{itemDetail(item, balance, language)}</p>
      </details>)}
    </div>
  </div>;
}
