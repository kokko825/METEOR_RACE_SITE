import assert from "node:assert/strict";
import { readJsonObject } from "../app/request-body.js";

const request = (body: string) => new Request("http://localhost/test", { method: "POST", body });
for (const body of ["", "{", "null", "[]", '"text"', "1", "true"]) {
  assert.equal(await readJsonObject(request(body)), null);
}
assert.deepEqual(await readJsonObject(request('{"nickname":"テスト"}')), { nickname: "テスト" });
assert.deepEqual(await readJsonObject(request("{}"), 2), {});
assert.equal(await readJsonObject(request("{}"), 1), null);
assert.equal(await readJsonObject(new Request("http://localhost/test")), null);
const encoded = new TextEncoder().encode('{"message":"蒸気"}');
const stream = new ReadableStream<Uint8Array>({ start(controller) {
  for (const byte of encoded) controller.enqueue(Uint8Array.of(byte));
  controller.close();
} });
// Workers accept streams directly; Node's test runtime additionally requires duplex.
const streamed = new Request("http://localhost/test", { method: "POST", body: stream, duplex: "half" } as RequestInit);
assert.deepEqual(await readJsonObject(streamed, encoded.length), { message: "蒸気" });
console.log("request-body: malformed input, object shape, byte bounds and split UTF-8 passed");
