import type { SiteLanguage } from "../app/hooks/use-local-settings";

export type TutorialCopyStep =
  | "welcome" | "goal" | "first-move" | "first-praise" | "rival"
  | "rival-result" | "second-move" | "meteor" | "meteor-result"
  | "large" | "free";

type Opening = "forward" | "side" | "back";
type TutorialLine = { title: string; body: string; action?: string };

const COPY: Record<SiteLanguage, Record<Exclude<TutorialCopyStep, "first-praise" | "meteor-result">, TutorialLine>> = {
  ja: {
    welcome: { title: "ようこそ、METEOR RACEへ", body: "星間管理AI AEQRISが、METEOR RACEの基礎をご案内します。", action: "案内を続ける" },
    goal: { title: "相手より先にCOREを目指しましょう", body: "探査機は縦横へ1マス移動します。メテオの爆風を利用すれば、斜め方向にも進めます。", action: "盤面を操作する" },
    "first-move": { title: "まず、探査機を動かしてみましょう", body: "光るマスはすべて選択できます。前進がおすすめですが、横移動や後退を選んでも問題ありません。" },
    rival: { title: "次は相手の手番です", body: "次へ進むと、相手の探査機が行動します。", action: "次へ" },
    "rival-result": { title: "相手の行動を確認しましょう", body: "相手も探査機を動かし、2手目以降はメテオを使用します。盤面に置かれたメテオは障害物としても働きます。", action: "次へ" },
    "second-move": { title: "好きな移動先を選んでください", body: "盤面の状況を確認し、進みたいマスを自由に選んでください。" },
    meteor: { title: "次はメテオを配置してみましょう", body: "小メテオは周囲1マスに爆風を起こします。自分を進めても、相手を妨害しても、将来の布石にしても構いません。" },
    large: { title: "大メテオも使用できます", body: "大メテオは内周を2マス、外周を1マス動かします。ここからは盤面に合わせて、大・小メテオやパスを自由に選べます。", action: "自由対戦へ" },
    free: { title: "ここからは自由にCOREを目指してください", body: "メテオを使い切ると、その手番中にボーナス移動が1回発生します。対戦相手はEASYのCPUです。", action: "次へ" },
  },
  en: {
    welcome: { title: "WELCOME TO METEOR RACE", body: "AEQRIS, the interstellar administration AI, will guide you through the basics.", action: "CONTINUE" },
    goal: { title: "REACH THE CORE BEFORE YOUR RIVAL", body: "Your probe moves one cell vertically or horizontally. Meteor blasts can also propel it diagonally.", action: "TRY THE BOARD" },
    "first-move": { title: "MOVE YOUR PROBE", body: "Every glowing cell is available. Moving forward is recommended, but moving sideways or backward is also valid." },
    rival: { title: "NOW IT IS YOUR RIVAL'S TURN", body: "Continue to let the rival probe act.", action: "NEXT" },
    "rival-result": { title: "REVIEW THE RIVAL'S ACTION", body: "Rivals also move their probes and can use meteors from their second turn onward. Meteors on the board also act as obstacles.", action: "NEXT" },
    "second-move": { title: "CHOOSE YOUR NEXT MOVE", body: "Read the board and select any available cell you want to move to." },
    meteor: { title: "PLACE A METEOR", body: "A small meteor blasts the surrounding cells. Use it to propel yourself, disrupt a rival, or prepare a future play." },
    large: { title: "LARGE METEORS ARE NOW AVAILABLE", body: "A large meteor moves probes two cells in its inner ring and one cell in its outer ring. From here, choose either meteor or pass according to the board.", action: "CONTINUE TO FREE PLAY" },
    free: { title: "NOW RACE FREELY TO THE CORE", body: "After using your last meteor, you gain one bonus move during that turn. Your rival is an EASY CPU.", action: "NEXT" },
  },
};

export function tutorialCopy(step: TutorialCopyStep, language: SiteLanguage, opening: Opening, hitRival: boolean): TutorialLine {
  if (step === "first-praise") {
    const titles = language === "ja"
      ? { forward: "素晴らしいです。COREへ前進できました", side: "横へずらすのも立派な戦略です", back: "後退から進路を作る判断も有効です" }
      : { forward: "EXCELLENT. YOU MOVED TOWARD THE CORE", side: "A SIDE STEP IS ALSO A SOUND STRATEGY", back: "RETREATING TO OPEN A ROUTE CAN ALSO WORK" };
    return { title: titles[opening], body: language === "ja" ? "選び方に正解は一つではありません。次は相手の行動を確認してみましょう。" : "There is no single correct opening. Now let us watch your rival act.", action: language === "ja" ? "相手の手番へ" : "RIVAL'S TURN" };
  }
  if (step === "meteor-result") {
    return {
      title: language === "ja" ? (hitRival ? "お見事です。相手を爆風で動かしました" : "メテオは障害物にも、次の推進力にもなります") : (hitRival ? "WELL DONE. THE BLAST MOVED YOUR RIVAL" : "METEORS CAN BLOCK ROUTES OR SET UP YOUR NEXT BOOST"),
      body: language === "ja" ? "大メテオは中心に近いほど強く、内周を2マス、外周を1マス動かします。以降も小・大を自由に選べます。" : "A large meteor is strongest near its center: the inner ring moves probes two cells and the outer ring moves them one. You may freely choose either meteor from now on.",
      action: language === "ja" ? "大メテオの説明へ" : "LARGE METEOR GUIDE",
    };
  }
  return COPY[language][step];
}
