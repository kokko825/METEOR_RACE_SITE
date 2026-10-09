// Local, repeatable comparison. Reads only the two AI source files from Git.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
const refs = process.argv.slice(2);
if (refs.length !== 2) throw new Error('Usage: node tests/compare-ai-revisions.mjs old-ref new-ref-or-WORKTREE');
const root = path.resolve('.cache/tests/ai-comparison');
async function load(ref, slot) {
  const base = path.join(root, slot);
  for (const file of ['config/game-balance.ts','config/match-events.ts','config/ai-strategy.ts','app/balance-config.ts','app/game-rules.ts','app/ai-engine.ts']) {
    const source = ref !== 'WORKTREE' && ['config/ai-strategy.ts','app/ai-engine.ts'].includes(file)
      ? execFileSync('git', ['show', `${ref}:${file}`], {encoding:'utf8'}) : fs.readFileSync(file,'utf8');
    const output = path.join(base, file.replace(/\.ts$/, '.js'));
    fs.mkdirSync(path.dirname(output), {recursive:true});
    fs.writeFileSync(output, ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/from "(\.[^"]+)(?<!\.js)"/g,'from "$1.js"'));
  }
  return {ai:await import(pathToFileURL(path.join(base,'app/ai-engine.js'))), rules:await import(pathToFileURL(path.join(base,'app/game-rules.js')))};
}
const [old, next] = await Promise.all([load(refs[0],'old'),load(refs[1],'new')]);
const R = next.rules;
function rng(seed) {return () => ((seed = (Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);}
function apply(s,d) {
  switch(d.type) {
    case 'setup': return R.applySetupItem(s,d.kind);
    case 'confirm_setup': return R.confirmSetupItems(s);
    case 'move': return R.applyMove(s,d.target);
    case 'meteor': return R.applyMeteor(s,d.target,d.size,d.useCapsule).state;
    case 'item': return R.applyUseItem(s,d.kind);
    case 'pass': return R.applyPass(s);
    case 'holo': return R.applyHoloSwitch(s,d.target);
    case 'blast': return R.applyBlastSwitch(s,d.target);
    case 'pulse': return R.applyPulseSwitch(s,d.target);
    case 'orbit': return R.applyOrbitSwitch(s,d.ring,d.clockwise,d.quarterTurns);
    case 'recall': return R.applyRecallItem(s,d.meteorId);
    default: return R.finishTurn(s,'comparison');
  }
}
const games=Number(process.env.AI_COMPARE_GAMES??16);
for(const difficulty of ['easy','normal','hard']) for(const [variant,size,count] of [['classic',9,2],['item',11,2],['team',15,4],['team-item',15,4]]) {
  const stats={difficulty,variant,size,games,oldWins:0,newWins:0,draws:0,decisions:0,changed:0,turns:0};
  for(let i=0;i<games;i++) {
    const players=['red','blue','green','yellow'].slice(0,count);
    const first=players[Math.floor(i/2)%count];
    let state=R.initialGameState(size,first,count,false,Math.floor(i/(count*2))%4,players,variant);
    const isNew=p=>(count===4?R.teamOf(p)===R.teamOf('red'):p==='red') === (i%2===0);
    for(let step=0;state.phase!=='over'&&step<300;step++) {
      const seed=173+i*7919+step*101;
      const a=old.ai.chooseAiDecision(state,difficulty,rng(seed));
      const b=next.ai.chooseAiDecision(state,difficulty,rng(seed));
      stats.decisions++; if(JSON.stringify(a)!==JSON.stringify(b)) stats.changed++;
      state=apply(state,isNew(state.turn)?b:a);
    }
    stats.turns+=state.turnCount;
    if(!state.winner) stats.draws++; else if(isNew(state.winner)) stats.newWins++; else stats.oldWins++;
  }
  console.log(JSON.stringify(stats));
}
