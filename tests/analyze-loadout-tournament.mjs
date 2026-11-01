import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve('.cache/tests/loadout-tournament',process.env.TOURNAMENT_LABEL||'full');
const meta=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
const games=fs.readFileSync(path.join(root,'games.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
assert.equal(new Set(games.map(g=>g.id)).size,games.length);
assert.equal(games.length,meta.count,'Tournament is incomplete');
const items=[...new Set(meta.hands.flat())];
const reports=[];
for(const difficulty of [...new Set(games.map(g=>g.difficulty))]){
  const matches=games.filter(g=>g.difficulty===difficulty);
  const stats=meta.hands.map((hand,id)=>({id,hand,games:0,wins:0,draws:0,points:0,turns:0,used:Object.fromEntries(items.map(k=>[k,0])),carried:Object.fromEntries(items.map(k=>[k,0])),opportunities:Object.fromEntries(items.map(k=>[k,0]))}));
  for(const g of matches)for(const side of ['red','blue']){
    const row=stats[g[side]],win=g.winner===side,draw=g.winner==='draw';
    row.games++;row.wins+=win?1:0;row.draws+=draw?1:0;row.points+=win?1:draw?.5:0;row.turns+=g.turns;
    for(const k of items){row.used[k]+=g.usage[side][k];row.carried[k]+=row.hand.filter(i=>i===k).length;row.opportunities[k]+=g.opportunities[side][k];}
  }
  for(const row of stats){row.scoreRate=row.games?row.points/row.games:null;row.meanTurns=row.games?row.turns/row.games:null;}
  const itemStats=items.map(item=>{const rows=stats.filter(x=>x.hand.includes(item));const sum=k=>rows.reduce((n,r)=>n+r[k][item],0);const appearances=rows.reduce((n,r)=>n+r.games,0);return{item,appearances,scoreRate:rows.reduce((n,r)=>n+r.points,0)/appearances,carried:sum('carried'),used:sum('used'),usePerCopy:sum('used')/sum('carried'),opportunities:sum('opportunities')};});
  const replacements=[];
  for(const from of items)for(const to of items)if(from!==to){const differences=[];
    for(const row of stats)if(row.games&&row.hand.includes(from)){
      const changed=[...row.hand];changed.splice(changed.indexOf(from),1,to);
      const key=[...changed].sort().join(',');const other=stats.find(s=>[...s.hand].sort().join(',')===key);
      if(other?.games)differences.push(other.scoreRate-row.scoreRate);
    }
    replacements.push({from,to,contexts:differences.length,meanScoreChange:differences.reduce((n,v)=>n+v,0)/differences.length});
  }
  reports.push({difficulty,games:matches.length,draws:matches.filter(g=>g.winner==='draw').length,redWins:matches.filter(g=>g.winner==='red').length,meanTurns:matches.reduce((n,g)=>n+g.turns,0)/matches.length,items:itemStats,rankings:stats.filter(s=>s.games).sort((a,b)=>b.scoreRate-a.scoreRate),replacements});
}
fs.writeFileSync(path.join(root,'analysis.json'),JSON.stringify({sourceHash:meta.sourceHash,reports},null,2));
for(const r of reports)console.log(JSON.stringify({...r,rankings:[...r.rankings.slice(0,7),...r.rankings.slice(-5)].map(({id,hand,games,scoreRate})=>({id,hand,games,scoreRate})),replacements:undefined}));
