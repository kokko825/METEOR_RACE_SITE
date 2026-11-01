import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const origin = process.env.TEST_ORIGIN || 'http://localhost:3000';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname), 'Local dummy data only');
let checked = 0;
for (const route of ['contact', 'chat', 'profile', 'rooms']) {
  for (const body of ['{', 'null', '[]', '"text"', '0', JSON.stringify({ message: 'x'.repeat(70_000) })]) {
    const response = await fetch(`${origin}/api/${route}`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': `local-test-${randomUUID()}`, 'x-meteor-player-id': `player:${randomUUID()}` }, body,
    });
    assert.equal(response.status, 400, `${route}: invalid JSON/shape/size must be rejected`);
    assert.equal(typeof (await response.json()).error, 'string');
    checked++;
  }
}
for (const [route, body] of [['chat', {message: 1}], ['chat', {message: 'hello', nickname: []}], ['profile', {nickname: []}], ['rooms', {action:'create',nickname:[]}], ['rooms', {action:'create',aiCount:'many'}], ['rooms', {action:'move',target:null}]]) {
  const response = await fetch(`${origin}/api/${route}`, {method:'POST', headers:{'content-type':'application/json','cf-connecting-ip':`local-test-${randomUUID()}`,'x-meteor-player-id':`player:${randomUUID()}`},body:JSON.stringify(body)});
  assert.equal(response.status, 400, `${route}: invalid field type must be rejected`);
  checked++;
}
console.log(`PASS: ${checked} invalid request cases rejected with JSON 400 responses`);
