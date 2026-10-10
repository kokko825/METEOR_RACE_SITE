import assert from "node:assert/strict";
import { eventBoardSizes, normalizeEventBoardSize, MATCH_EVENT_ORDER, normalizeMatchEvents, normalizeEventInterval, normalizeEventIntervals, orderMatchEvents } from "../config/match-events";
import { applyMatchEvent, applyMove, applyMeteor, applyBlastSwitch, warpEntrants, samePos, skipBlockedMove, finishTurn, initialGameState, distance, resolveCoreArrivals, type EventForecast, type GameState } from "../app/game-rules";
const event = (kind: EventForecast["kind"]): EventForecast => ({ kind, target: { r: 2, c: 4 }, ring: 2, clockwise: true, dr: 0, dc: 1 });
const start = (kind: EventForecast["kind"], count = 2, size = 9, seed = 21) => initialGameState(size, "red", count, false, 0, [], "classic", undefined, false, kind, seed);
const round = (state: GameState) => { const count = state.players.length; for (let i = 0; i < count; i++) state = finishTurn(state); return state; };

// Gates are persistent terrain; relocation never places them under an object.
for (const size of [11, 13, 15]) for (let seed = 1; seed <= 100; seed++) {
  let state = start("warp", 4, size, seed);
  assert.equal(state.warpGates?.length, 2);
  const mid = Math.floor(size / 2);
  assert.equal(distance(state.warpGates![0], { r: mid, c: mid }), 2);
  assert.equal(distance(state.warpGates![1], { r: mid, c: mid }), mid - 1);
  for (let n = 0; n < 5; n++) {
    const before = state;
    state = round(state);
    assert.ok(state.warpGates?.every(g => !state.players.some(p => samePos(g, state.probes[p]))));
    assert.deepEqual(JSON.parse(JSON.stringify(state)), JSON.parse(JSON.stringify(round(JSON.parse(JSON.stringify(before))))));
    if (n < 4) assert.deepEqual(state.warpGates, before.warpGates);
    else assert.notDeepEqual(state.warpGates, before.warpGates);
  }
}
{
  const state = start("warp", 2, 13);
  state.phase = "move"; state.turnCount = 2;
  state.warpGates = [{ r: 6, c: 8 }, { r: 11, c: 6 }];
  state.probes.red = { r: 10, c: 6 };
  const moved = applyMove(state, { r: 11, c: 6 });
  assert.deepEqual(moved.probes.red, { r: 6, c: 8 }, "Landing transfers immediately");
  assert.equal(moved.warpFlash, 1);
  assert.deepEqual(warpEntrants(moved, moved).probes, moved.probes, "Standing on a gate cannot bounce forever");
  assert.deepEqual(applyMove(moved.phase === "move" ? moved : { ...moved, phase: "move" }, { r: 6, c: 7 }).probes.red, { r: 6, c: 7 });
  const blocked = { ...state, meteors: [{ r: 6, c: 8, owner: "blue" as const, size: "small" as const, id: 90 }] };
  assert.deepEqual(applyMove(blocked, { r: 11, c: 6 }).probes.red, { r: 11, c: 6 }, "Occupied exit prevents transfer");
  const pushed = applyMatchEvent(state, { ...event("wind"), dr: 1, dc: 0 });
  assert.deepEqual(pushed.probes.red, { r: 6, c: 8 }, "Event movement uses gates too");
  const meteor = applyMeteor({ ...state, phase: "place" }, { r: 9, c: 6 }, "small").state;
  assert.deepEqual(meteor.probes.red, { r: 6, c: 8 }, "Meteor landing transfers");
  const blast = applyBlastSwitch({ ...state, phase: "switch", pendingSwitches: [{ kind: "blast", player: "red" }] }, { r: 8, c: 6 });
  assert.deepEqual(blast.probes.red, { r: 6, c: 8 }, "BLAST landing transfers");
  const reversed = { ...state, probes: { ...state.probes, red: { r: 6, c: 7 } } };
  assert.deepEqual(applyMove(reversed, { r: 6, c: 8 }).probes.red, { r: 11, c: 6 }, "Gates are bidirectional");
  const occupied = { ...state, meteors: [{ r: 4, c: 6, owner: "blue" as const, size: "small" as const, id: 9 }], obstacles: [{ r: 6, c: 4, owner: "blue" as const, id: 10, turns: 99 }], pulseDevices: [{ r: 8, c: 6, owner: "blue" as const, id: 11, turns: 99 }] };
  for (let seed = 1; seed <= 100; seed++) {
    const relocated = applyMatchEvent({ ...occupied, matchEvent: { ...occupied.matchEvent!, seed } }, event("warp"));
    assert.deepEqual(relocated.probes, occupied.probes, "Relocation cannot move a probe");
    assert.ok(relocated.warpGates!.every(g => ![...occupied.meteors, ...occupied.obstacles, ...occupied.pulseDevices, ...occupied.players.map(p => occupied.probes[p])].some(p => samePos(g, p))));
  }
}

for (const team of [false, true]) for (const item of [false, true]) for (let count = 0; count <= 4; count++) {
  const events = MATCH_EVENT_ORDER.slice(0, count);
  const minimum = team || count >= 2 ? 13 : item || count === 1 ? 11 : 9;
  assert.equal(eventBoardSizes(events, team, item)[0], minimum);
  for (const requested of [9, 11, 13, 15]) {
    const actual = normalizeEventBoardSize(requested, events, team, item);
    assert.ok(eventBoardSizes(events, team, item).includes(actual));
    assert.ok(actual >= minimum);
    if (count > 0 && requested >= minimum) assert.equal(actual, requested);
  }
}
assert.deepEqual(normalizeMatchEvents(["wind", "orbit", "wind", "invalid", "off"]), ["wind", "orbit"]);
assert.equal(normalizeEventInterval(1), 3); assert.equal(normalizeEventInterval(100), 99);
for (let mask = 1; mask < 16; mask++) for (const count of [2, 3, 4]) for (const interval of [3, 5, 9]) {
  const kinds = MATCH_EVENT_ORDER.filter((_, i) => mask & (1 << i));
  let state = initialGameState(15, "red", count, false, 0, [], "classic", undefined, false, kinds, 731, interval);
  for (let n = 0; n < interval - 2; n++) state = round(state);
  assert.deepEqual(state.matchEvent!.forecasts!.map((f) => f.kind), kinds);
  state = round(state);
  const saved = structuredClone(state);
  state = round(state);
  assert.deepEqual(state, round(saved), "Multi-event replay is deterministic");
  const stages = state.matchEvent!.stages!;
  assert.deepEqual(stages.map((s) => s.forecast.kind), kinds);
  for (let i = 1; i < stages.length; i++) assert.deepEqual(stages[i].before, stages[i - 1].after);
  assert.equal(state.matchEvent!.remaining, interval);
}
{
  const state = initialGameState(9, "red", 2, false, 0, [], "classic", undefined, false, ["geyser", "wind"], 1, 3);
  state.probes.red = { r: 4, c: 3 }; state.probes.blue = { r: 0, c: 0 };
  state.matchEvent = { ...state.matchEvent!, remaining: 1, forecast: event("geyser"), forecasts: [event("geyser"), event("wind")] };
  const won = round(state);
  assert.equal(won.winner, "red"); assert.equal(won.matchEvent!.stages!.length, 1, "CORE arrival stops subsequent effects");
}

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
assert.deepEqual(normalizeEventIntervals({ wind: 2, gravity: 500, geyser: NaN }), { orbit: 5, geyser: 5, wind: 3, gravity: 99, warp: 5 });
for (const count of [2, 3, 4]) {
  const intervals = { orbit: 3, geyser: 5, wind: 7, gravity: 9, warp: 11 };
  let state = initialGameState(15, "red", count, false, 0, [], "classic", undefined, false, MATCH_EVENT_ORDER, 42, intervals);
  for (let n = 1; n <= 45; n++) {
    state.turnCount = 0; // Exercise repeated event cycles independently of the match timeout.
    state.probes = { red: { r: 0, c: 0 }, blue: { r: 14, c: 14 }, green: { r: 0, c: 14 }, yellow: { r: 14, c: 0 } };
    const saved = JSON.parse(JSON.stringify(state)) as GameState;
    const previousSerial = state.matchEvent!.serial;
    state = round(state);
    assert.deepEqual(JSON.parse(JSON.stringify(state)), JSON.parse(JSON.stringify(round(saved))), "Independent periods replay identically after network serialization");
    const due = MATCH_EVENT_ORDER.filter(k => n % intervals[k as keyof typeof intervals] === 0);
    assert.deepEqual(state.matchEvent!.serial > previousSerial ? state.matchEvent!.stages!.map(s => s.forecast.kind) : [], due, `periods: round ${n}/${count} players`);
    for (const kind of MATCH_EVENT_ORDER) {
      const interval = intervals[kind as keyof typeof intervals];
      const remaining = interval - n % interval;
      assert.equal(state.matchEvent!.schedule![kind]!.remaining, remaining, `${kind} round ${n} / players ${count} phase ${state.phase}`);
      assert.equal(Boolean(state.matchEvent!.schedule![kind]!.forecast), remaining <= 2, "Each event announces exactly two rounds ahead");
    }
    const stages = state.matchEvent!.stages ?? [];
    for (let i = 1; i < stages.length; i++) assert.deepEqual(stages[i].before, stages[i - 1].after);
  }
}
console.log("match-events: independent 3/5/7/9-round clocks, simultaneous order and online replay passed");
{
  const state = start("geyser");
  state.probes.red = { r: 3, c: 4 }; state.probes.blue = { r: 0, c: 0 };
  state.meteors = [{ r: 4, c: 4, id: 10, owner: "red", size: "small" }, { r: 2, c: 3, id: 11, owner: "blue", size: "large" }];
  state.obstacles = [{ r: 1, c: 4, id: 12, owner: "blue", turns: 8 }];
  state.pulseDevices = [{ r: 1, c: 3, id: 13, owner: "blue", turns: 8 }];
  const after = applyMatchEvent(state, event("geyser"));
  assert.deepEqual(after.probes.red, state.probes.red, "A meteor stops steam-driven movement");
  for (const key of ["meteors", "obstacles", "pulseDevices", "inventory"] as const) assert.deepEqual(after[key], state[key], "Steam neither damages nor refunds placed objects");
  state.meteors = state.meteors.filter(m => m.id !== 10);
  assert.deepEqual(applyMatchEvent(state, event("geyser")).probes.red, { r: 4, c: 4 }, "An open route allows steam propulsion");
}
{
  const state = initialGameState(9, "red", 2);
  state.turnCount = 4;
  state.probes.red = { r: 8, c: 4 };
  state.pulseDevices = [{ r: 7, c: 4, id: 3, owner: "blue", turns: 8 }];
  const skipped = skipBlockedMove(state);
  assert.equal(skipped.phase, "place");
  assert.equal(skipped.turn, "red");
  assert.equal(skipped.turnCount, 4);
  assert.deepEqual(skipped.inventory, state.inventory);
  state.pulseDevices = [];
  state.meteors = [{ r: 7, c: 4, id: 1, owner: "blue", size: "small" }, { r: 8, c: 3, id: 2, owner: "blue", size: "small" }, { r: 8, c: 5, id: 3, owner: "blue", size: "large" }];
  assert.equal(skipBlockedMove(state).phase, "place", "Surrounded probes can still place meteors");
  state.meteors = [];
  assert.throws(() => skipBlockedMove(state), "Skipping an available movement is forbidden");
}
/** Tactical chains: wind-to-ring entry, steam propulsion, then an inward finish. */
{
  const state = initialGameState(13, "red", 2);
  state.probes.red = { r: 4, c: 7 }; state.probes.blue = { r: 0, c: 0 };
  state.meteors = [{ r: 3, c: 6, id: 11, owner: "red", size: "small" }];
  const vent = { ...event("geyser"), target: { r: 3, c: 6 } };
  const orbit = { ...event("orbit"), ring: 3 };
  const protectedFirst = applyMatchEvent(state, vent);
  assert.deepEqual(protectedFirst.probes.red, state.probes.red, "A deliberately covered vent stays quiet before rotation");
  const rotatedFirst = applyMatchEvent(state, orbit);
  assert.notDeepEqual(applyMatchEvent(rotatedFirst, vent).probes, applyMatchEvent(protectedFirst, orbit).probes, "Rotating first can remove the planned vent cover");
}
{
  const state = initialGameState(13, "red", 2);
  state.probes.red = { r: 3, c: 7 }; state.probes.blue = { r: 0, c: 0 };
  const wind = { ...event("wind"), dr: 1, dc: 0 };
  const orbit = { ...event("orbit"), ring: 2 };
  const moved = applyMatchEvent(state, wind);
  assert.deepEqual(moved.probes.red, { r: 4, c: 7 });
  const rotated = applyMatchEvent(moved, orbit);
  assert.deepEqual(rotated.probes.red, { r: 7, c: 8 }, "Wind can board a rotating ring");
  assert.deepEqual(applyMatchEvent(rotated, event("gravity")).probes.red, { r: 6, c: 7 }, "Gravity converts the new lane into forward progress");
  rotated.meteors = [{ r: 6, c: 7, id: 12, owner: "blue", size: "small" }];
  assert.deepEqual(applyMatchEvent(rotated, event("gravity")).probes.red, rotated.probes.red, "A placed meteor still counters the final pull");
}
{
  const oldOrder = ["orbit", "geyser", "wind", "gravity"].map(k => event(k as EventForecast["kind"]));
  const snapshot = JSON.stringify(oldOrder);
  assert.deepEqual(orderMatchEvents(oldOrder).map(f => f.kind), ["wind", "orbit", "geyser", "gravity"]);
  assert.equal(JSON.stringify(oldOrder), snapshot, "Saved forecast arrays remain immutable");
  const state = initialGameState(13, "red", 2, false, 0, [], "classic", undefined, false, MATCH_EVENT_ORDER.filter(k => k !== "warp"), 21, 3);
  state.matchEvent = { ...state.matchEvent!, remaining: 1, forecast: oldOrder[0], forecasts: oldOrder };
  const after = round(state);
  assert.deepEqual(after.matchEvent!.stages!.map(s => s.forecast.kind), MATCH_EVENT_ORDER.filter(kind => kind !== "warp"), "Previously saved rooms resolve in the current order");
}
{
  const state = initialGameState(13, "red", 2, false, 0, [], "classic", undefined, false, MATCH_EVENT_ORDER.filter(k => k !== "warp"), 21, 3);
  state.probes.red = { r: 3, c: 7 }; state.probes.blue = { r: 0, c: 0 };
  const chain = [
    { ...event("wind"), dr: 1, dc: 0 },
    { ...event("orbit"), ring: 2 },
    { ...event("geyser"), target: { r: 8, c: 9 } },
    event("gravity"),
  ];
  let next = state;
  const positions = [{ r: 4, c: 7 }, { r: 7, c: 8 }, { r: 6, c: 7 }, { r: 6, c: 6 }];
  chain.forEach((forecast, i) => {
    next = applyMatchEvent(next, forecast);
    assert.deepEqual(next.probes.red, positions[i], "Wind / orbit / steam / gravity chain");
  });
  state.matchEvent = { ...state.matchEvent!, remaining: 1, forecast: chain[0], forecasts: chain };
  const replay = round(state);
  assert.equal(replay.winner, "red");
  assert.deepEqual(replay.matchEvent!.stages!.map(stage => stage.forecast.kind), ["wind", "orbit", "geyser", "gravity"]);
  assert.deepEqual(replay.probes.red, { r: 6, c: 6 }, "Full round uses the same chain as the individual resolver");
}
