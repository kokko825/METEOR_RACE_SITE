// Paired replay of 1.0.114's long multiplayer matches; never contacts production.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import ts from "typescript";
const policy = process.env.PACING_POLICY ?? "current";
assert.ok(["baseline", "current"].includes(policy));
const root = path.resolve(".cache/tests/multiplayer-pacing", process.env.PACING_SUITE ?? policy);
for (const file of ["app/game-rules.ts", "app/ai-engine.ts", "app/balance-config.ts", "config/game-balance.ts", "config/ai-strategy.ts", "config/match-events.ts"]) {
  const source = policy === "current" ? fs.readFileSync(file, "utf8") : execFileSync("git", ["show", `f4ac261:${file}`], { encoding: "utf8" });
  const dest = path.join(root, file.replace(/\.ts$/, ".js"));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText.replace(/from "(\.[^"]+)(?<!\.js)"/g, 'from "$1.js"'));
}
const r = await import(pathToFileURL(path.join(root, "app/game-rules.js")));
const { chooseAiDecision } = await import(pathToFileURL(path.join(root, "app/ai-engine.js")));
const hands = [], items = r.SELECTABLE_ITEMS;
for (let a=0;a<items.length;a++) for(let b=a;b<items.length;b++) for(let c=b;c<items.length;c++) if(a!==c) hands.push([items[a],items[b],items[c]]);
const cases = process.env.PACING_CASES ? process.env.PACING_CASES.split(",").map(Number) : Array.from({length:27},(_,i)=>i*4+2);
const results = [];
for (const g of cases) {
  const size = [11,13,15][Math.floor(g/4)%3];
  const difficulty = ["easy","normal","hard"][Math.floor(g/12)%3];
  const event = ["off","wind","orbit","geyser","gravity","warp",["wind","orbit","geyser","gravity","warp"]][Math.floor(g/3)%7];
  const variant = process.env.PACING_MODE ?? "item";
  const count = Number(process.env.PACING_PLAYERS ?? 4);
  const offset = Number(process.env.PACING_SEED_OFFSET ?? 0);
  const first = ["red", "blue", "green", "yellow"][(g + offset) % count];
  let s = r.initialGameState(size,offset ? first : "red",count,false,(g+offset)%4,[],variant,undefined,false,event,g+1+offset,3+g%5);
  s.phase="move";
  if(r.isItemVariant(variant)) s.itemHands=Object.fromEntries(s.players.map((p,i)=>[p,[...hands[(g+i*13)%hands.length]]]));
  const dist = (s,p) => Math.abs(s.probes[p].r-Math.floor(s.size/2))+Math.abs(s.probes[p].c-Math.floor(s.size/2));
  let seed=12345+g*9871+offset;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  let firstGoal=null, actions=0, placements=0, selfPropulsion=0, denial=0, assists=0, retreats=0;
  const goals=[], trace=[];
  while(s.phase!=="over" && actions<800) {
    const before=s, actor=s.turn, d=chooseAiDecision(s,difficulty,random);
    if(d.type==="move") { s=r.applyMove(s,d.target); if(dist(s,actor)>dist(before,actor)) retreats++; }
    else if(d.type==="meteor") s=r.applyMeteor(s,d.target,d.size,d.useCapsule).state;
    else if(d.type==="item") s=r.applyUseItem(s,d.kind);
    else if(d.type==="pass") s=r.applyPass(s);
    else if(d.type==="holo") s=r.applyHoloSwitch(s,d.target);
    else if(d.type==="blast") s=r.applyBlastSwitch(s,d.target);
    else if(d.type==="pulse") s=r.applyPulseSwitch(s,d.target);
    else if(d.type==="recall") s=r.applyRecallItem(s,d.meteorId);
    else if(s.phase==="move" && !r.legalMoves(s).length) s=r.skipBlockedMove(s);
    else if(d.type==="skip" && s.phase==="place") s=r.finishTurn(s,"AI skip");
    else throw Error(`Unhandled ${JSON.stringify(d)}`);
    if(d.type==="meteor") {
      placements++;
      if(dist(s,actor)<dist(before,actor)) selfPropulsion++;
      if(r.activePlayers(before).some(p=>p!==actor && dist(s,p)>dist(before,p))) denial++;
      if(r.activePlayers(before).some(p=>p!==actor && dist(s,p)<dist(before,p))) assists++;
    }
    for(const p of s.finishOrder??[]) if(!(before.finishOrder??[]).includes(p)) {goals.push({p,turn:before.turnCount});firstGoal??=before.turnCount;}
    trace.push({turn:before.turnCount,actor,phase:before.phase,decision:d,distances:Object.fromEntries(r.activePlayers(s).map(p=>[p,dist(s,p)])),inventory:s.inventory,finished:s.finishOrder});
    if(process.env.PACING_TRACE==="1" && before.turnCount>=70 && before.phase==="place" && !fs.existsSync(path.join(root,`state-${g}.json`))) fs.writeFileSync(path.join(root,`state-${g}.json`),JSON.stringify(before));
    assert.notDeepEqual(s,before);
    for (const inventory of Object.values(s.inventory)) {
      assert.ok(inventory.small >= 0 && inventory.large >= 0, "Inventory cannot be negative");
    }
    assert.equal(new Set(s.finishOrder ?? []).size, (s.finishOrder ?? []).length, "Each rank is assigned once");
    actions++;
  }
  assert.equal(s.phase,"over");
  const result={g,size:s.size,count,variant,difficulty,event,turns:s.turnCount,firstGoal,goals,winner:s.winner,placements,selfPropulsion,denial,assists,retreats};
  results.push(result);
  if(process.env.PACING_TRACE==="1") fs.writeFileSync(path.join(root,`trace-${g}.json`),JSON.stringify(trace));
  fs.writeFileSync(path.join(root,"results.json"),JSON.stringify(results,null,2));
  console.log(JSON.stringify({policy,...result}));
}
console.log(JSON.stringify({policy,games:results.length,meanTurns:results.reduce((n,v)=>n+v.turns,0)/results.length,draws:results.filter(v=>v.winner==="draw").length}));
if (process.env.PACING_COMPARE) {
  const baseline = JSON.parse(fs.readFileSync(path.resolve(".cache/tests/multiplayer-pacing", process.env.PACING_COMPARE, "results.json"), "utf8"));
  assert.deepEqual(results.map(v => v.g), baseline.map(v => v.g), "Paired cases must match");
  const total = (a, key) => a.reduce((sum, v) => sum + v[key], 0);
  assert.ok(total(results, "turns") < total(baseline, "turns"), "Mean duration must improve in the comparison suite");
  assert.ok(results.filter(v => v.winner === "draw").length <= baseline.filter(v => v.winner === "draw").length, "Draw count must not increase in the comparison suite");
  assert.ok(total(results, "denial") / total(results, "placements") >= .3, "Pacing must not erase defensive play");
}
