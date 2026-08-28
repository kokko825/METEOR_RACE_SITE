/** 世界観ページに表示する認可装備と提供企業です。ゲーム効果とは分離して編集します。 */
export const ITEM_LORE = [
  { kind: "shield", company: "AEGIS FRAME", ja: "採掘現場の落石防護技術を転用し、探査機の周囲へ瞬間展開式フィールドを形成する競技用安全装置です。", en: "A competition safety unit adapted from mining-site impact protection. It projects a temporary field around the probe." },
  { kind: "booster", company: "VOLTERRA DRIVE", ja: "探査機の駆動系へ短時間だけ出力を集中させる補助推進装置です。機体性能の差が出ないようREGULAが出力を制限しています。", en: "An auxiliary drive that briefly concentrates power into the probe's propulsion system. REGULA limits its output to keep machines equal." },
  { kind: "holo", company: "MIRAGE WORKS", ja: "測量用の立体投影技術から生まれた、触れられる競技用ホログラム障害物です。実体を傷つけず進路だけを制限します。", en: "A tangible competitive hologram derived from survey projection technology. It blocks routes without damaging physical equipment." },
  { kind: "orbit", company: "KEPLER DYNAMICS", ja: "衛星群の軌道補正技術を盤面制御へ応用した装置です。指定したリング内の競技データを同期して回転させます。", en: "A board-control system derived from satellite orbit correction. It synchronizes and rotates all competition data on a selected ring." },
  { kind: "blast", company: "PYRA INDUSTRIES", ja: "鉱床を傷つけず周囲の岩盤だけを動かす非接触採掘技術です。競技では衛星から爆風データのみを投射します。", en: "A contactless mining technology that shifts surrounding rock without harming the deposit. In competition, satellites project only its blast data." },
  { kind: "pulse", company: "NEXWAVE SYSTEMS", ja: "遭難機の暴走を止める電磁制御技術を、非破壊の移動制限装置へ転用したものです。通信と装備操作は妨げません。", en: "Electromagnetic control technology once used to halt runaway rescue craft, adapted into a non-destructive movement restraint." },
  { kind: "recall", company: "ANCHOR LOGISTICS", ja: "軌道上の採掘機材を遠隔回収する物流システムです。競技衛星と連携し、自社が展開した装備だけを識別して回収します。", en: "An orbital logistics system for remotely retrieving mining equipment. It identifies and recovers only gear deployed by its own corporation." },
] as const;

export type ItemLoreKind = typeof ITEM_LORE[number]["kind"];
