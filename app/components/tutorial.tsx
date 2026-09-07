"use client";

import { useMemo, useState } from "react";
import { MeteorIcon, ProbeToken } from "./game-pieces";
import type { Pos } from "../game-rules";

type TutorialProps = { onExit: () => void };
type Stage = "welcome" | "goal" | "first-move" | "first-praise" | "rival" | "second-move" | "meteor" | "meteor-result" | "rival-advance" | "large" | "large-result" | "free" | "complete";

const SIZE = 9;
const CORE = { r: 4, c: 4 };
const same = (a: Pos, b: Pos) => a.r === b.r && a.c === b.c;
const chebyshev = (a: Pos, b: Pos) => Math.max(Math.abs(a.r - b.r), Math.abs(a.c - b.c));
const adjacent = (a: Pos, b: Pos) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
const clamp = (value: number) => Math.max(0, Math.min(SIZE - 1, value));

function towardCore(pos: Pos): Pos {
  if (pos.r !== CORE.r) return { r: pos.r + Math.sign(CORE.r - pos.r), c: pos.c };
  if (pos.c !== CORE.c) return { r: pos.r, c: pos.c + Math.sign(CORE.c - pos.c) };
  return pos;
}

export function Tutorial({ onExit }: TutorialProps) {
  const [stage, setStage] = useState<Stage>("welcome");
  const [red, setRed] = useState<Pos>({ r: 8, c: 4 });
  const [blue, setBlue] = useState<Pos>({ r: 0, c: 4 });
  const [smallMeteor, setSmallMeteor] = useState<Pos | null>(null);
  const [largeMeteor, setLargeMeteor] = useState<Pos | null>(null);
  const [firstDirection, setFirstDirection] = useState<"forward" | "side" | "back">("forward");
  const [skippedBlastLesson, setSkippedBlastLesson] = useState(false);

  const copy = useMemo(() => {
    switch (stage) {
      case "welcome": return { title: "ようこそ、METEOR RACEへ。", body: "こちらは星間管理AI AEQRIS。アストラ協定に基づき、あなたの初回競技を案内する。" };
      case "goal": return { title: "相手より先にCOREへ", body: "METEOR RACEは、相手の探査機より先に盤面中央のCOREを目指す、非暴力の競技だ。" };
      case "first-move": return { title: "まず動いてみよう", body: "光っているマスから好きな進路を選択。探査機は縦か横へ1マス移動できる。" };
      case "first-praise": return firstDirection === "forward"
        ? { title: "素晴らしい前進だ。", body: "COREへ近づく、最も基本的な一手。" }
        : { title: "良い判断だ。", body: firstDirection === "side" ? "最初に横へずれることも、相手の狙いを外す戦略になる。" : "最初に前へ行かないことも戦略のひとつ。盤面を広く見ている。" };
      case "rival": return { title: "次は相手の手番", body: "相手が前進し、あなたの進路へ小メテオを投下する。2手目以降はメテオを使い、爆風で探査機を動かせる。" };
      case "second-move": return { title: "もう一度、前進してみよう", body: "光る前方マスを選択。目の前のメテオへ近づいてみよう。" };
      case "meteor": return firstDirection === "forward"
        ? { title: "目の前にメテオがある。", body: "指定された左斜め後ろへ小メテオを配置し、その爆風で進路を切り開こう。" }
        : { title: "障害物を見越した進路だ。", body: "メテオは爆風だけでなく障害物にもなる。指定マスへ小メテオを置き、爆風を試そう。" };
      case "meteor-result": return skippedBlastLesson
        ? { title: "飲み込みが早い。", body: "すでに相手を爆風へ巻き込めているため、次の妨害練習は省略する。" }
        : { title: "爆風移動、成功。", body: "爆風なら斜めにも進める。爆風に巻き込まれたメテオは消滅する。" };
      case "rival-advance": return { title: "相手もCOREへ向かう", body: "相手は妨害せず前進した。今度はこちらから進行を遅らせてみよう。" };
      case "large": return { title: "大メテオを解禁", body: "大メテオは小メテオの2倍の規模。中心に近いほど強く、外周1周目は2マス、2周目は1マス吹き飛ばす。強調された範囲へ配置しよう。" };
      case "large-result": return { title: "見事な使い方だ。", body: chebyshev(largeMeteor ?? red, blue) <= 2 ? "相手を押し戻す攻撃的な一手。" : "自分を進める推進力として使うのも正解だ。" };
      case "free": return { title: "では、そのままCOREへ", body: "ここからは自由に進もう。相手は練習に付き合い、先にゴールすることはない。" };
      case "complete": return { title: "おめでとうございます。", body: "これでチュートリアル終了です。お疲れ様でした。" };
    }
  }, [stage, firstDirection, largeMeteor, red, blue, skippedBlastLesson]);

  const moveTargets = stage === "first-move"
    ? [{ r: 7, c: 4 }, { r: 8, c: 3 }, { r: 8, c: 5 }]
    : stage === "second-move"
      ? [towardCore(red)]
      : stage === "free"
        ? [{ r: red.r - 1, c: red.c }, { r: red.r + 1, c: red.c }, { r: red.r, c: red.c - 1 }, { r: red.r, c: red.c + 1 }].filter((p) => p.r >= 0 && p.c >= 0 && p.r < SIZE && p.c < SIZE && !same(p, blue) && !(smallMeteor && same(p, smallMeteor)))
        : [];
  const tutorialMeteorTarget = { r: clamp(red.r + 1), c: clamp(red.c - 1) };
  const rivalBlastTargets = [
    { r: blue.r + 1, c: blue.c }, { r: blue.r - 1, c: blue.c },
    { r: blue.r, c: blue.c + 1 }, { r: blue.r, c: blue.c - 1 },
  ].filter((p) => p.r >= 0 && p.c >= 0 && p.r < SIZE && p.c < SIZE && !same(p, red));
  const meteorTargets = [tutorialMeteorTarget, ...rivalBlastTargets];
  const largeTargets = [{ r: clamp(blue.r + 1), c: blue.c }, { r: clamp(red.r + 1), c: red.c }];

  const continueTutorial = () => {
    if (stage === "welcome") setStage("goal");
    else if (stage === "goal") setStage("first-move");
    else if (stage === "first-praise") {
      const nextBlue = towardCore(blue);
      setBlue(nextBlue);
      const target = { r: clamp(red.r - 2), c: red.c };
      setSmallMeteor(same(target, nextBlue) ? { r: target.r, c: clamp(target.c + 1) } : target);
      setStage("rival");
    } else if (stage === "rival") setStage("second-move");
    else if (stage === "meteor-result") {
      if (skippedBlastLesson) setStage("large");
      else {
        setBlue((current) => towardCore(current));
        setStage("rival-advance");
      }
    } else if (stage === "rival-advance") setStage("large");
    else if (stage === "large-result") setStage(same(red, CORE) ? "complete" : "free");
  };

  const handleCell = (target: Pos) => {
    if (stage === "first-move" && moveTargets.some((p) => same(p, target))) {
      setFirstDirection(target.r < red.r ? "forward" : target.c !== red.c ? "side" : "back");
      setRed(target);
      setStage("first-praise");
      return;
    }
    if (stage === "second-move" && same(target, towardCore(red))) {
      setRed(target);
      setStage("meteor");
      return;
    }
    if (stage === "meteor" && meteorTargets.some((p) => same(p, target))) {
      const hitsBlue = chebyshev(target, blue) <= 1;
      setSkippedBlastLesson(hitsBlue);
      setSmallMeteor(target);
      if (hitsBlue) setBlue({ r: clamp(blue.r - Math.sign(target.r - blue.r)), c: clamp(blue.c - Math.sign(target.c - blue.c)) });
      else setRed({ r: clamp(red.r - 1), c: clamp(red.c + 1) });
      setStage("meteor-result");
      return;
    }
    if (stage === "large" && largeTargets.some((p) => same(p, target))) {
      setLargeMeteor(target);
      if (chebyshev(target, blue) <= 2) setBlue({ r: Math.max(0, blue.r - 2), c: blue.c });
      else setRed({ r: Math.max(CORE.r, red.r - 2), c: red.c });
      setStage("large-result");
      return;
    }
    if (stage === "free" && moveTargets.some((p) => same(p, target)) && adjacent(red, target)) {
      setRed(target);
      if (same(target, CORE)) { setStage("complete"); return; }
      const nextBlue = towardCore(blue);
      if (!same(nextBlue, CORE) && !same(nextBlue, target)) setBlue(nextBlue);
    }
  };

  const dimmed = !["first-move", "second-move", "meteor", "large", "free"].includes(stage);
  return (
    <section className="tutorial-screen" aria-label="METEOR RACE チュートリアル">
      <header><button type="button" onClick={onExit}>← 終了</button><div><small>AEQRIS // TRAINING CONTROL</small><strong>基本競技チュートリアル</strong></div><b>{stage === "complete" ? "COMPLETE" : "TRAINING"}</b></header>
      <div className="tutorial-arena">
        <div className={`tutorial-board${dimmed ? " dimmed" : ""}`}>
          {Array.from({ length: SIZE * SIZE }, (_, index) => {
            const pos = { r: Math.floor(index / SIZE), c: index % SIZE };
            const active = moveTargets.some((p) => same(p, pos)) || (stage === "meteor" && meteorTargets.some((p) => same(p, pos))) || (stage === "large" && largeTargets.some((p) => same(p, pos)));
            return <button key={index} type="button" className={`tutorial-cell${active ? " target" : ""}`} onClick={() => handleCell(pos)} disabled={!active} aria-label={`${pos.r + 1}行${pos.c + 1}列`}>
              {same(pos, CORE) && <span className="core-ring"><b>CORE</b></span>}
              {smallMeteor && same(pos, smallMeteor) && <MeteorIcon meteor={{ ...pos, owner:"blue", size:"small", id:1 }} />}
              {largeMeteor && same(pos, largeMeteor) && <MeteorIcon meteor={{ ...pos, owner:"red", size:"large", id:2 }} />}
              {same(pos, red) && <ProbeToken player="red" rotation={0} teamMode={false} isSelf />}
              {same(pos, blue) && <ProbeToken player="blue" rotation={180} teamMode={false} />}
              {active && (stage !== "meteor" || same(pos, tutorialMeteorTarget)) && <span className="tutorial-target-ring" />}
            </button>;
          })}
        </div>
        <aside className="tutorial-dialog" role="status" aria-live="polite">
          <span className="tutorial-ai">AEQRIS</span><div><h2>{copy.title}</h2><p>{copy.body}</p></div>
          {["welcome", "goal", "first-praise", "rival", "meteor-result", "rival-advance", "large-result"].includes(stage) && <button type="button" onClick={continueTutorial}>次へ ▶</button>}
          {stage === "complete" && <button type="button" onClick={onExit}>ホーム画面へ戻る</button>}
        </aside>
      </div>
    </section>
  );
}
