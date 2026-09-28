import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const origin=process.env.TEST_ORIGIN || 'http://localhost:5173';
assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname), 'Local database only');
async function request(id,body){
  const r=await fetch(origin+'/api/rooms',{method:'POST',headers:{'Content-Type':'application/json','x-meteor-player-id':id},body:JSON.stringify(body)});
  return {status:r.status,data:await r.json()};
}
for(let repeat=0;repeat<3;repeat++){
  const ids=Array.from({length:3},()=>`player:${randomUUID()}`);
  const [host,guest,third]=ids;
  const created=await request(host,{action:'create',humanCount:1,aiCount:3,size:11,variant:'classic',difficulty:'hard',nickname:'QA host'});
  assert.equal(created.status,201);
  const code=created.data.code;
  const call=(id,body)=>request(id,{...body,code});
  try {
    assert.equal(created.data.lobbyAiDifficulty,'hard');
    const joined=await call(guest,{action:'join',nickname:'QA guest'});
    assert.equal(joined.data.lobbyAiCount,2,'Human arrival replaces a CPU slot');
    assert.equal((await call(guest,{action:'switch_team'})).status,403,'Legacy action must enforce host permission');
    const lobby=await call(host,{action:'update_lobby_settings',variant:'classic',size:9,aiCount:3,difficulty:'hard'});
    assert.equal(lobby.data.lobbyAiCount,2);
    assert.equal(lobby.data.lobbySize,11,'Four-player preview cannot use a 9x9 board');
    const swapped=await call(host,{action:'swap_role',targetRole:'blue'});
    assert.equal(swapped.data.role,'blue');
    const started=await call(host,{action:'new_game',version:swapped.data.version,variant:'classic',size:9,humanCount:2,aiCount:2,difficulty:'hard'});
    assert.equal(started.status,200);
    assert.equal(started.data.role,'blue','Start must retain the exchanged seat');
    assert.deepEqual(started.data.memberRoles,swapped.data.memberRoles);
    assert.equal(started.data.state.size,11);
    await call(host,{action:'return_lobby'});
    const joinedThird=await call(third,{action:'join',nickname:'QA third'});
    const thirdRole=joinedThird.data.role;
    await call(host,{action:'manage_member',targetIndex:0,memberAction:'spectate'});
    await call(guest,{action:'leave'});
    const snapshot=await fetch(origin+`/api/rooms?code=${code}`,{headers:{'x-meteor-player-id':host}}).then(r=>r.json());
    assert.deepEqual(snapshot.memberRoles,[null,thirdRole],'Leaving must not shift spectator/player seats');
    const team=await call(host,{action:'update_lobby_settings',variant:'team-item',size:11,aiCount:0,difficulty:'easy'});
    assert.equal(team.data.lobbySize,13);
    assert.equal(team.data.lobbyAiCount,3,'Team preview fills four seats');
    const items=await call(host,{action:'new_game',version:team.data.version,variant:'item',size:9,humanCount:1,aiCount:1,difficulty:'easy'});
    assert.equal(items.status,200);
    assert.equal(items.data.state.size,11,'Item matches cannot start on an unsupported board');
  } finally {
    for(const id of [third,guest,host]) await call(id,{action:'leave'});
  }
}
console.log('PASS: online seat ownership, spectator retention, CPU limits, board limits and difficulty; three runs');
