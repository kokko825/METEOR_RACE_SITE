import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const origin = "http://localhost:3000";
const ids = Array.from({ length: 3 }, () => `player:${randomUUID()}`);
async function call(id, path, body) {
  const response = await fetch(origin + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", "x-meteor-player-id": id }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json() };
}
const code = `月テストab${Date.now().toString().slice(-4)}`;
const normalized = code.toUpperCase();
const room = (id, body) => call(id, "/api/rooms", { code, ...body });
try {
  const competing = await Promise.all(ids.slice(0, 2).map(id => room(id, { action: "create", nickname: "TEST" })));
  assert.deepEqual(competing.map(r => r.status).sort(), [201, 409]);
  assert.equal(competing.find(r => r.status === 201).data.code, normalized);
  const host = ids[competing.findIndex(r => r.status === 201)];
  const guest = ids[2];
  assert.equal((await room(guest, { action: "join" })).status, 200);
  assert.equal((await call(guest, `/api/rooms?code=${encodeURIComponent(code)}`)).data.code, normalized);
  assert.equal((await call(host, "/api/chat", { code, nickname: "TEST", message: "確認用メッセージ" })).status, 201);
  const chatPath = `/api/chat?code=${encodeURIComponent(code)}`;
  assert.equal((await call(guest, chatPath)).data.messages.length, 1);
  for (const id of [guest, host]) await room(id, { action: "leave" });
  assert.equal((await room(guest, { action: "create" })).status, 201);
  assert.equal((await call(guest, chatPath)).data.messages.length, 0, "Reused code must not expose old chat");
  assert.equal((await call(host, chatPath)).status, 403);
  for (const invalid of ["a", "a b", "部屋😀", "あ".repeat(13), 123]) {
    assert.equal((await room(host, { action: "create", code: invalid })).status, 400);
  }
  const auto = await room(host, { action: "create", code: "" });
  assert.equal(auto.status, 201);
  assert.match(auto.data.code, /^[A-Z2-9]{6}$/);
  await room(host, { action: "leave", code: auto.data.code });
  console.log("room-code: mixed Japanese, collision race, joining, chat, reuse and validation passed");
} finally {
  for (const id of ids) await room(id, { action: "leave" });
}
