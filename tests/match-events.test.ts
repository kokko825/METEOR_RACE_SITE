import assert from "node:assert/strict";
import { applyMatchEvent, finishTurn, initialGameState, distance, resolveCoreArrivals, type EventForecast, type GameState } from "../app/game-rules";
const event = (kind: EventForecast["kind"]): EventForecast => ({ kind, target: { r: 2, c: 4 }, ring: 2, clockwise: true, dr: 0, dc: 1 });
const start = (kind: EventForecast["kind"], count = 2, size = 9, seed = 21) => initialGameState(size, "red", count, false, 0, [], "classic", undefined, false, kind, seed);
const round = (state: GameState) => { const count = state.players.length; for (let i = 0; i < count; i++) state = finishTurn(state); return state; };

const windDirections = new Set<string>();
for (let seed = 0; seed < 200; seed++) {
  const f = round(round(round(start("wind", 2, 11, Math.imul(seed, 2654435761) >>> 0)))).matchEvent!.forecast!;
  windDirections.add(`${f.dr},${f.dc}`);
}
assert.equal(windDirections.size, 8, "Forecast can choose all eight wind directions");
for (const dr of [-1, 0, 1]) for (const dc of [-1, 0, 1]) {
  if (!dr && !dc) continue;
  const state = start("wind"); state.probes.red = { r: 4, c: 4 }; state.probes.blue = { r: 0, c: 0 };
  const f = { ...event("wind"), dr, dc };
  assert.deepEqual(applyMatchEvent(state, f).probes.red, { r: 4 + dr, c: 4 + dc });
  state.meteors = [{ r: 4 + dr, c: 4 + dc, id: 1, size: "small", owner: "blue" }];
  assert.deepEqual(applyMatchEvent(state, f).probes.red, state.probes.red, "Wind cannot enter an occupied destination");
}

for (let seed = 0; seed < 100; seed++) {
  let state = start("orbit", 2, 11, seed);
  state.probes.red = { r: 3, c: 5 }; state.probes.blue = { r: 5, c: 7 };
  state = round(round(round(state)));
  assert.equal(state.matchEvent!.forecast!.ring, 2, "Forecast targets the most populated inner ring");
  assert.ok(state.matchEvent!.forecast!.secondRing! > 2, "Second ring is in the outer half");
}
{
  const state = start("orbit", 2, 11);
  state.probes.red = { r: 3, c: 5 }; state.probes.blue = { r: 1, c: 5 };
  const next = applyMatchEvent(state, { ...event("orbit"), ring: 2, secondRing: 4 });
  assert.deepEqual(next.probes.red, { r: 5, c: 7 });
  assert.deepEqual(next.probes.blue, { r: 5, c: 1 });
}

for (const kind of ["geyser", "orbit", "gravity", "wind"] as const) for (const count of [2, 3, 4]) {
  let state = start(kind, count);
  for (let r = 1; r <= 2; r++) { state = round(state); assert.equal(state.matchEvent?.forecast, undefined); }
  state = round(state);
  assert.equal(state.matchEvent?.remaining, 2);
  assert.ok(state.matchEvent?.forecast);
  const forecast = JSON.stringify(state.matchEvent?.forecast);
  state = round(state);
  assert.equal(state.matchEvent?.remaining, 1);
  assert.equal(JSON.stringify(state.matchEvent?.forecast), forecast);
  const saved = JSON.parse(JSON.stringify(state)) as GameState;
  state = round(state);
  assert.deepEqual(state, round(saved), "Replaying online state must produce identical results");
  assert.equal(state.matchEvent?.serial, 1);
  assert.equal(state.matchEvent?.remaining, 5);
  assert.equal(JSON.stringify(state.matchEvent?.last), forecast);
}
for (const size of [9, 11, 13, 15]) for (let seed = 0; seed < 100; seed++) {
  const orbit = round(round(round(start("orbit", 2, size, seed)))).matchEvent!.forecast!;
  assert.ok(orbit.secondRing! - orbit.ring >= 2, `Nonadjacent rings: ${size}/${seed}`);
  let state = start("geyser", 2, size, seed);
  state = round(round(round(state)));
  const vents = state.matchEvent!.forecast!.vents!;
  assert.equal(vents.length, 4);
  const mid = Math.floor(size / 2);
  assert.ok(vents[0].r < mid && vents[1].r > mid && vents[2].c < mid && vents[3].c > mid);
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) assert.ok(distance(vents[i], vents[j]) > 2, `Overlapping vents: ${size}/${seed}`);
}
{
  const state = start("geyser");
  state.probes.red = { r: 3, c: 4 };
  const f = event("geyser");
  assert.deepEqual(applyMatchEvent(state, f).probes.red, { r: 4, c: 4 });
  for (const blocker of ["probe", "meteor", "holo", "pulse"]) {
    const blocked = structuredClone(state);
    if (blocker === "probe") blocked.probes.blue = f.target;
    if (blocker === "meteor") blocked.meteors = [{ ...f.target, id: 1, owner: "blue", size: "small" }];
    if (blocker === "holo") blocked.obstacles = [{ ...f.target, id: 2, owner: "blue", turns: 10 }];
    if (blocker === "pulse") blocked.pulseDevices = [{ ...f.target, id: 3, owner: "blue", turns: 10 }];
    assert.deepEqual(applyMatchEvent(blocked, f), blocked, `${blocker} covers vent`);
  }
  state.matchEvent = { ...state.matchEvent!, remaining: 1, forecast: f };
  const won = round(state);
  assert.equal(won.phase, "over"); assert.equal(won.winner, "red");
}
{
  const state = start("gravity");
  state.probes.red = { r: 6, c: 6 }; state.probes.blue = { r: 0, c: 0 };
  assert.deepEqual(applyMatchEvent(state, event("gravity")).probes.red, { r: 5, c: 5 });
  state.meteors = [{ r: 5, c: 5, owner: "blue", size: "small", id: 1 }];
  assert.deepEqual(applyMatchEvent(state, event("gravity")).probes.red, state.probes.red);
  state.meteors = []; state.probes.red = { r: 3, c: 3 }; state.probes.blue = { r: 5, c: 5 };
  assert.deepEqual(applyMatchEvent(state, event("gravity")).probes, state.probes, "Two probes targeting CORE both stop");
  state.probes.blue = { r: 0, c: 0 };
  assert.deepEqual(applyMatchEvent(state, event("gravity")).probes.red, { r: 4, c: 4 });
}
{
  const state = start("gravity"); state.probes.red = { r: 6, c: 4 };
  state.meteors = [{ r: 5, c: 4, owner: "blue", size: "small", id: 1 }];
  const next = applyMatchEvent(state, event("gravity"));
  assert.deepEqual(next.probes.red, state.probes.red); assert.deepEqual(next.meteors, state.meteors);
  state.probes.blue = { r: 7, c: 4 };
  assert.deepEqual(applyMatchEvent(state, event("wind")).probes.red, { r: 6, c: 5 });
  state.probes.blue = { r: 6, c: 5 };
  assert.deepEqual(applyMatchEvent(state, event("wind")).probes.red, state.probes.red);
}
{
  const state = start("orbit"); state.probes.red = { r: 2, c: 4 };
  state.pulseDevices = [{ r: 4, c: 2, owner: "blue", id: 1, turns: 10 }];
  const next = applyMatchEvent(state, event("orbit"));
  assert.deepEqual(next.probes.red, { r: 4, c: 6 });
  assert.deepEqual(next.pulseDevices?.[0], { r: 2, c: 4, owner: "blue", id: 1, turns: 10 });
}
assert.equal(initialGameState(9, "red", 2, false, 0, [], "classic", undefined, true, "wind").matchEvent, undefined);
assert.equal(start("off").matchEvent, undefined);
{
  const state = start("wind", 4, 11);
  state.turn = "yellow";
  state.matchEvent = { ...state.matchEvent!, remaining: 3, acted: ["red", "blue", "green"] };
  const next = resolveCoreArrivals(state, { ...state, probes: { ...state.probes, yellow: { r: 5, c: 5 } } }, ["yellow"]);
  assert.equal(next.matchEvent?.remaining, 2, "A retiring last actor still closes the round");
  assert.equal(next.turn, "red");
  assert.deepEqual(next.matchEvent?.acted, []);
}
console.log("match-events: forecasts, 400 vent layouts, blocked vents, collisions, wins and replay passed");
