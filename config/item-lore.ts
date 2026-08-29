/** 世界観ページに表示する認可装備と提供元です。ゲーム効果とは分離して編集します。 */
export const ITEM_LORE = [
  { kind: "shield", company: "AEGIS FRAME", ja: "採掘現場の落石防護技術を転用し、探査機の周囲へ瞬間展開式フィールドを形成する競技用安全装置。", en: "A competition safety unit adapted from mining-site impact protection. It projects a temporary field around the probe." },
  { kind: "booster", company: "VOLTERRA DRIVE", ja: "探査機の駆動系へ短時間だけ出力を集中させる補助推進装置。機体性能の差を抑えるため、AEQRISが出力を制限。", en: "An auxiliary drive that briefly concentrates power into the probe's propulsion system. AEQRIS limits its output to keep machines equal." },
  { kind: "holo", company: "MIRAGE WEAVE", ja: "測量用の立体投影技術から生まれた、触れられる競技用ホログラム障害物。実体を傷つけず、進路だけを制限。", en: "A tangible competitive hologram derived from survey projection technology. It blocks routes without damaging physical equipment." },
  { kind: "orbit", company: "KEPLER DYNAMICS", ja: "衛星群の軌道補正技術を盤面制御へ応用した装置。指定リング内の競技データを同期し、90度回転。", en: "A board-control system derived from satellite orbit correction. It synchronizes and rotates all competition data on a selected ring." },
  { kind: "blast", company: "PYRA IMPACT", ja: "鉱床を傷つけず周囲の岩盤だけを動かす非接触採掘技術。競技では衛星から爆風データのみを投射。", en: "A contactless mining technology that shifts surrounding rock without harming the deposit. In competition, satellites project only its blast data." },
  { kind: "pulse", company: "NEXWAVE SYSTEMS", ja: "遭難機の暴走を止める電磁制御技術を、非破壊の移動制限装置へ転用。通信と装備操作には干渉しない。", en: "Electromagnetic control technology once used to halt runaway rescue craft, adapted into a non-destructive movement restraint." },
  { kind: "recall", company: "AEQRIS FIELD CONTROL", operator: true, ja: "障害物が増えすぎた競技フィールドを安全に整地する、AEQRIS運営の回収技術を競技用に転用。自社の通常メテオだけを手元へ戻し、自社のHOLOを消去。", en: "A competitive adaptation of AEQRIS field-control technology used to clear overcrowded arenas safely. It returns only the user's normal meteors and removes their HOLO units." },
] as const;

export type ItemLoreKind = typeof ITEM_LORE[number]["kind"];
