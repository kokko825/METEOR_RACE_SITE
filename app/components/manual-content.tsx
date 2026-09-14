import type { CSSProperties } from "react";
import type { SiteLanguage } from "../hooks/use-local-settings";
import type { BalanceConfig } from "../balance-config";
import { uiText } from "../i18n";
import { ITEM_ICONS, SELECTABLE_ITEMS, itemDetail } from "../item-content";
import { ITEM_LORE } from "../../config/item-lore";

/** Display-only manual content. Forms, modal state and submission stay in page.tsx. */
export function WorldArchive({
  language,
  progress,
}: {
  language: SiteLanguage;
  progress: number;
}) {
  const t = (key: Parameters<typeof uiText>[1]) => uiText(language, key);
  return (
    <>
      <section className="manual-world-hero">
        <div
          className="manual-world-orbit"
          style={{ "--regula-progress": `${progress}%` } as CSSProperties}
          aria-hidden="true"
        >
          <i />
          <i />
          <i />
          <strong>AEQRIS</strong>
          <span>ASTRA NETWORK</span>
          <b>CORE APPROACH {progress}%</b>
        </div>
        <div className="manual-world-copy">
          <small>ARCHIVE / ASTRA ACCORD</small>
          <p>{t("worldEra")}</p>
          <p>{t("worldAccord")}</p>
          <p>{t("worldRegula")}</p>
          <p>{t("worldBroadcast")}</p>
          <strong>{t("worldFinale")}</strong>
          <b>METEOR RACE</b>
        </div>
      </section>
      <section className="authorized-equipment">
        <header>
          <small>AUTHORIZED EQUIPMENT / OFFICIAL SOURCES</small>
          <h3>
            {language === "ja"
              ? "AEQRIS認可競技装備と提供元"
              : "AEQRIS-AUTHORIZED EQUIPMENT & SOURCES"}
          </h3>
          <p>
            {language === "ja"
              ? "協賛企業の提供装備と、AEQRIS運営技術を競技用に認可。"
              : "Competition equipment includes partner-supplied units and authorized adaptations of AEQRIS operations technology."}
          </p>
        </header>
        <div>
          {ITEM_LORE.map((item) => (
            <article key={item.kind} className={item.kind}>
              <i aria-hidden="true">{ITEM_ICONS[item.kind]}</i>
              <span>
                <small>
                  {language === "ja"
                    ? "operator" in item && item.operator
                      ? `${item.company} / AEQRIS運営機能`
                      : `${item.company}社 提供`
                    : "operator" in item && item.operator
                      ? `${item.company} / AEQRIS OPERATIONS`
                      : `PROVIDED BY ${item.company}`}
                </small>
                <b>{item.kind.toUpperCase()}</b>
                <p>{language === "ja" ? item.ja : item.en}</p>
              </span>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
export function RulesArchive({
  language,
  balance,
}: {
  language: SiteLanguage;
  balance: BalanceConfig;
}) {
  const t = (key: Parameters<typeof uiText>[1]) => uiText(language, key);
  return (
    <div className="manual-onepage">
      <section className="manual-rules">
        <header>
          <small>01</small>
          <h3>{t("turnLoopHeading")}</h3>
        </header>
        <div className="manual-rule-content">
          <div className="manual-turn-loop">
            <article>
              <span>01</span>
              <i>✥</i>
              <div>
                <b>MOVE</b>
                <p>{t("manualMove")}</p>
              </div>
            </article>
            <em>↓</em>
            <article>
              <span>02</span>
              <i>◆</i>
              <div>
                <b>METEOR</b>
                <p>{t("manualMeteor")}</p>
              </div>
            </article>
            <em>↓</em>
            <article>
              <span>03</span>
              <i>{ITEM_ICONS.shield}</i>
              <div>
                <b>ITEM</b>
                <p>{t("manualItem")}</p>
              </div>
            </article>
            <strong>{t("manualNext")}</strong>
          </div>
          <div className="manual-notes">
            <p>{t("noDiagonal")}</p>
            <p>{t("blastPropulsion")}</p>
            <p>{t("anyCoreArrival")}</p>
            <p>{t("firstTurnRule")}</p>
            <p>{t("bonusMoveRule")}</p>
          </div>
        </div>
      </section>
      <section className="manual-items">
        <header>
          <small>02</small>
          <h3>{t("itemArchiveHeading")}</h3>
        </header>
        <div className="manual-item-grid">
          {SELECTABLE_ITEMS.map((kind) => (
            <article key={kind} className={kind}>
              <i aria-hidden="true">{ITEM_ICONS[kind]}</i>
              <div>
                <b>{kind.toUpperCase()}</b>
                <p>{itemDetail(kind, balance, language)}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
