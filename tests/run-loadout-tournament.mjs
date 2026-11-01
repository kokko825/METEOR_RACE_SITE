// Reproducible offline tournament. Production rules and loadout settings are unchanged.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import {execFileSync} from 'node:child_process';

const sources=['app/game-rules.ts','app/ai-engine.ts','app/balance-config.ts','config/game-balance.ts','config/ai-strategy.ts','config/match-events.ts'];
if(isMainThread){
  const label=process.env.TOURNAMENT_LABEL||'full';
  assert.match(label,/^[a-z0-9-]+$/);
  const root=path.resolve('.cache/tests/loadout-tournament',label);
  fs.mkdirSync(root,{recursive:true});
  const hash=crypto.createHash('sha256');
  const policy=process.env.TOURNAMENT_POLICY||'baseline';
  assert.ok(['baseline','lookahead','spend'].includes(policy));
  for(const file of sources){let source=fs.readFileSync(file,'utf8');
    if(file==='app/ai-engine.ts'&&policy!=='baseline'){
      const from=policy==='spend'?'const itemReserveValue: Record<ItemKind, number> = { ...AI_STRATEGY.items.reserve };':'return placed.value + developmentBonus - retreatPenalty;';
      const to=policy==='spend'?'const itemReserveValue = Object.fromEntries(Object.keys(AI_STRATEGY.items.reserve).map(k => [k, 0])) as Record<ItemKind, number>;':
        'const itemState = applyMove(state, move); const itemValues = [...new Set(itemState.itemHands?.[player] ?? [])].filter(kind => canUseItem(itemState, kind)).map(kind => itemUseValue(itemState, kind, player, difficulty) ?? -Infinity); return Math.max(placed.value, ...itemValues) + developmentBonus - retreatPenalty;';
      assert.equal(source.split(from).length,2);source=source.replace(from,to);
    }
    hash.update(file+source);const dest=path.join(root,file.replace(/\.ts$/,'.js'));fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/from "(\.[^"]+)(?<!\.js)"/g,'from "$1.js"'));}
  const sourceHash=hash.digest('hex');
  const compare=process.env.TOURNAMENT_COMPARE==='1';
  const baselineRef=process.env.TOURNAMENT_BASELINE_REF||'HEAD';
  let baselineHash;
  if(compare){const h=crypto.createHash('sha256');for(const file of sources){
    const source=execFileSync('git',['--work-tree='+process.cwd(),'show',baselineRef+':'+file],{encoding:'utf8'});
    h.update(file+source);const dest=path.join(root,'baseline',file.replace(/\.ts$/,'.js'));
    fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/from "(\.[^"]+)(?<!\.js)"/g,'from "$1.js"'));
  }baselineHash=h.digest('hex');}
  const r=await import(pathToFileURL(path.join(root,'app/game-rules.js')));
  const items=r.SELECTABLE_ITEMS, hands=[];
  for(let a=0;a<items.length;a++)for(let b=a;b<items.length;b++)for(let c=b;c<items.length;c++)if(a!==c)hands.push([items[a],items[b],items[c]]);
  assert.equal(hands.length,50);
  const jobs=[];
  for(const difficulty of (process.env.TOURNAMENT_DIFFICULTIES||'normal,hard').split(','))for(let a=0;a<50;a++)for(let b=a;b<50;b++)for(let repeat=0;repeat<2;repeat++)for(let leg=0;leg<2;leg++)jobs.push({id:jobs.length,a,b,repeat,leg,difficulty,size:Number(process.env.TOURNAMENT_SIZE||13),...(process.env.TOURNAMENT_EVENTS==='all'?{event:['wind','orbit','geyser','gravity','warp']}:{} )});
  const multi=process.env.TOURNAMENT_MULTI==='1';
  if(multi){jobs.length=0;const chosen=[45,43,5,20];for(const mode of ['three','four','team'])for(let a=0;a<chosen.length;a++)for(let b=a+1;b<chosen.length;b++)for(let repeat=0;repeat<2;repeat++)for(let leg=0;leg<2;leg++)jobs.push({id:jobs.length,a:chosen[a],b:chosen[b],repeat,leg,difficulty:'normal',size:13,mode,count:mode==='three'?3:4});}
  if(process.env.TOURNAMENT_FOCUS){const focus=Number(process.env.TOURNAMENT_FOCUS);const focused=jobs.filter(j=>j.a===focus||j.b===focus);jobs.length=0;jobs.push(...focused);}
  // Benchmark samples span the whole schedule, not just the first loadout.
  const limit=Number(process.env.TOURNAMENT_LIMIT||0);
  assert.ok(!limit||limit%4===0);
  let selected=limit?Array.from({length:limit/4},(_,i)=>{const offset=Math.floor(i*(jobs.length/4)/(limit/4))*4;return jobs.slice(offset,offset+4);}).flat():jobs;
  if(compare)selected=selected.flatMap(job=>['red','blue'].map((candidateSide,index)=>({...job,id:job.id*2+index,candidateSide})));
  const meta={sourceHash,hands,count:selected.length,description:multi?'Selected NORMAL top/bottom loadouts; three/four/team, not exhaustive':`${process.env.TOURNAMENT_SIZE||13}x${process.env.TOURNAMENT_SIZE||13}, 1v1, ${process.env.TOURNAMENT_EVENTS==='all'?'all events':'no events'}, 2 orientations x 2 assigned sides; seeded NORMAL, deterministic HARD`};
  const metaPath=path.join(root,'manifest.json');
  if(compare)meta.baselineHash=baselineHash;
  if(fs.existsSync(metaPath))assert.deepEqual(JSON.parse(fs.readFileSync(metaPath,'utf8')),meta,'Resume inputs differ; choose a new label');
  fs.writeFileSync(metaPath,JSON.stringify(meta,null,2));
  const resultPath=path.join(root,'games.jsonl');
  const done=new Set(fs.existsSync(resultPath)?fs.readFileSync(resultPath,'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l).id):[]);
  const pending=selected.filter(j=>!done.has(j.id));
  const started=Date.now();let cursor=0,completed=0;
  const workers=Array.from({length:Math.min(Number(process.env.TOURNAMENT_WORKERS||4),pending.length)},()=>new Worker(new URL(import.meta.url),{workerData:{root,hands,compare}}));
  function progress(){console.log(JSON.stringify({done:done.size+completed,total:selected.length,elapsedSeconds:Math.round((Date.now()-started)/1000),remainingEstimateSeconds:completed?Math.round((selected.length-done.size-completed)*(Date.now()-started)/1000/completed):null}));}
  const timer=setInterval(progress,30000);
  try{await Promise.all(workers.map(w=>new Promise((resolve,reject)=>{
    function next(){if(cursor<pending.length)w.postMessage(pending[cursor++]);else{w.postMessage(null);resolve();}}
    w.on('message',v=>{if(v.error){reject(Error(v.error));return;}fs.appendFileSync(resultPath,JSON.stringify(v)+'\n');completed++;next();});w.on('error',reject);w.on('exit',code=>{if(code)reject(Error(`worker exit ${code}`));});next();
  })));}finally{clearInterval(timer);await Promise.all(workers.map(w=>w.terminate()));}
  progress();
}else{
  const r=await import(pathToFileURL(path.join(workerData.root,'app/game-rules.js')));
  const {chooseAiDecision}=await import(pathToFileURL(path.join(workerData.root,'app/ai-engine.js')));
  const oldAi=workerData.compare?(await import(pathToFileURL(path.join(workerData.root,'baseline/app/ai-engine.js')))).chooseAiDecision:null;
  const zero=()=>Object.fromEntries(r.SELECTABLE_ITEMS.map(k=>[k,0]));
  parentPort.on('message',job=>{if(!job)return;try{
    const {a,b,repeat,leg,difficulty,size}=job;
    const red=leg?b:a,blue=leg?a:b;
    let seed=139121+a*701+b*7919+repeat*100003;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    let s=r.initialGameState(size,'red',job.count||2,false,repeat,[],job.mode==='team'?'team-item':'item',undefined,false,job.event||'off',seed);s.phase='move';
    const assigned={red,blue,green:job.mode==='team'?blue:red,yellow:job.mode==='team'?red:blue};
    s.itemHands=Object.fromEntries(s.players.map(p=>[p,[...workerData.hands[assigned[p]]]]));
    const usage=Object.fromEntries(s.players.map(p=>[p,zero()])),opportunities=Object.fromEntries(s.players.map(p=>[p,zero()]));
    let actions=0;
    while(s.phase!=='over'&&actions<800){
      const before=s,d=(oldAi&&s.turn!==job.candidateSide?oldAi:chooseAiDecision)(s,difficulty,random);
      for(const kind of r.SELECTABLE_ITEMS)if(r.canUseItem(before,kind))opportunities[before.turn][kind]++;
      if(d.type==='move')s=r.applyMove(s,d.target);
      else if(d.type==='meteor')s=r.applyMeteor(s,d.target,d.size,d.useCapsule).state;
      else if(d.type==='item'){s=r.applyUseItem(s,d.kind);usage[before.turn][d.kind]++;}
      else if(d.type==='pass')s=r.applyPass(s);
      else if(d.type==='holo')s=r.applyHoloSwitch(s,d.target);
      else if(d.type==='blast')s=r.applyBlastSwitch(s,d.target);
      else if(d.type==='pulse')s=r.applyPulseSwitch(s,d.target);
      else if(d.type==='recall')s=r.applyRecallItem(s,d.meteorId);
      else if(s.phase==='move'&&!r.legalMoves(s).length)s=r.skipBlockedMove(s);
      else if(d.type==='skip'&&s.phase==='place')s=r.finishTurn(s);
      else throw Error(`Unhandled ${JSON.stringify(d)}`);
      assert.notDeepEqual(s,before);
      for(const p of r.activePlayers(s)){assert.ok(!s.meteors.some(m=>r.samePos(m,s.probes[p])));assert.ok(s.inventory[p].small>=0&&s.inventory[p].large>=0);}
      actions++;
    }
    assert.equal(s.phase,'over');
    parentPort.postMessage({...job,red,blue,winner:s.winner,finishOrder:s.finishOrder,turns:s.turnCount,actions,usage,opportunities,remaining:s.itemHands});
  }catch(error){parentPort.postMessage({error:`${JSON.stringify(job)} ${error.stack}`});}});
}
