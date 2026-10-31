import assert from "node:assert/strict";
import { initialGameState, applyMove, legalMoves, samePos, applyMatchEvent, type GameState } from "../app/game-rules";

const fixture = (size = 13, count = 2, team = false): GameState => {
  const s = initialGameState(size, "red", count, false, 0, [], team ? "team-item" : "item");
  s.phase = "move"; s.turnCount = 8;
  s.probes.red = { r: 3, c: 3 }; s.probes.blue = { r: 1, c: 1 };
  s.boosterMoves.red = 1;
  return s;
};
let cases = 0;
for (const size of [11, 13, 15]) for (const count of [2, 3, 4]) for (const team of [false, true]) {
  if (team && (count !== 4 || size === 11)) continue;
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) for (const steps of [1, 2]) {
    for (const owner of ["red", "blue"] as const) for (const meteorSize of ["small", "large"] as const) {
      const s = fixture(size, count, team);
      const target = { r: 3 + dr * steps, c: 3 + dc * steps };
      s.meteors = [{ ...target, id: 90, owner, size: meteorSize }];
      s.inventory[owner][meteorSize]--;
      const original = JSON.stringify(s);
      assert.ok(legalMoves(s).some(p => samePos(p, target)));
      const next = applyMove(s, target);
      assert.equal(next.meteors.length, 0);
      assert.equal(next.inventory[owner][meteorSize], s.inventory[owner][meteorSize] + 1);
      assert.equal(next.boosterMoves.red, 0);
      assert.deepEqual(next.probes.blue, s.probes.blue, "ram does not create a blast");
      assert.equal(JSON.stringify(s), original, "AI simulation must not mutate its input");
      assert.deepEqual(JSON.parse(JSON.stringify(next)), JSON.parse(JSON.stringify(applyMove(JSON.parse(original), target))), "serialized online replay agrees");
      cases++;
    }
  }
}
{
  const s = fixture();
  s.meteors = [1, 2].map(n => ({ r: 3, c: 3 + n, owner: "blue" as const, size: "small" as const, id: n }));
  s.inventory.blue.small = 0;
  const n = applyMove(s, { r: 3, c: 5 });
  assert.equal(n.meteors.length, 0); assert.equal(n.inventory.blue.small, 2);
  assert.equal(n.boosterMoves.red, 0, "adjacent meteors consume one charge together");
}
{
  const s = fixture();
  s.obstacles = [{ r: 3, c: 4, id: 50, owner: "blue", turns: 8 }];
  assert.ok(!legalMoves(s).some(p => samePos(p, { r: 3, c: 4 })));
  const n = applyMove(s, { r: 3, c: 5 });
  assert.deepEqual(n.obstacles, s.obstacles, "HOLO survives a jump");
  s.obstacles[0].c = 5;
  assert.ok(!legalMoves(s).some(p => samePos(p, { r: 3, c: 5 })), "HOLO blocks landing");
}
{
  const s = fixture();
  s.probes.blue = { r: 3, c: 4 };
  assert.ok(!legalMoves(s).some(p => p.r === 3 && p.c > 3));
  s.probes.blue = { r: 1, c: 1 };
  s.pulseDevices = [{ r: 3, c: 5, owner: "blue", id: 6, turns: 4 }];
  assert.ok(!legalMoves(s).some(p => samePos(p, { r: 3, c: 5 })));
  s.pulseDevices[0].c = 4;
  assert.equal(legalMoves(s).length, 0, "BOOSTER does not escape an active PULSE field");
}
{
  const s = fixture();
  s.inventory.red = { small: 0, large: 0 };
  s.meteors = [{ r: 3, c: 4, owner: "red", id: 2, size: "small" }];
  const n = applyMove(s, { r: 3, c: 4 });
  assert.equal(n.phase, "place"); assert.equal(n.bonusMove, false, "returned meteor removes meteorless bonus eligibility");
  s.bonusMove = true;
  assert.notEqual(applyMove(s, { r: 3, c: 4 }).turn, "red", "existing bonus move ends after ramming");
}
{
  const s = fixture();
  s.meteors = [{ r: 3, c: 4, owner: "blue", id: 2, size: "small", consumable: true }];
  assert.equal(applyMove(s, { r: 3, c: 4 }).inventory.blue.small, s.inventory.blue.small);
  s.meteors = [];
  assert.equal(applyMove(s, { r: 3, c: 4 }).boosterMoves.red, 1);
  s.boosterMoves.red = 0;
  s.meteors = [{ r: 3, c: 4, owner: "blue", id: 2, size: "large" }];
  assert.ok(!legalMoves(s).some(p => samePos(p, { r: 3, c: 4 })));
}
{
  const s = fixture();
  s.probes.red = { r: 8, c: 6 };
  s.meteors = [{ r: 7, c: 6, owner: "blue", id: 2, size: "small" }];
  const n = applyMove(s, { r: 6, c: 6 });
  assert.equal(n.winner, "red"); assert.equal(n.meteors.length, 0);
}
{
  const s = fixture();
  s.warpGates = [{ r: 3, c: 4 }, { r: 10, c: 10 }];
  s.meteors = [{ r: 3, c: 4, owner: "blue", id: 2, size: "small" }];
  const n = applyMove(s, { r: 3, c: 4 });
  assert.deepEqual(n.probes.red, { r: 10, c: 10 });
  assert.equal(n.meteors.length, 0); assert.equal(n.boosterMoves.red, 0);
  assert.deepEqual(applyMove(s, { r: 3, c: 5 }).probes.red, { r: 3, c: 5 }, "passing over gate does not teleport");
}
{
  const s = fixture();
  s.meteors = [{ r: 3, c: 4, owner: "blue", id: 2, size: "small" }];
  const n = applyMove(s, { r: 3, c: 5 });
  const event = { kind: "geyser" as const, target: { r: 3, c: 4 }, ring: 2, clockwise: true, dr: 0, dc: 1 };
  assert.deepEqual(applyMatchEvent(n, event).probes.red, { r: 3, c: 6 }, "passing through uncovers a vent");
  const stop = applyMove(s, { r: 3, c: 4 });
  assert.deepEqual(applyMatchEvent(stop, event).probes.red, stop.probes.red, "landing still covers vent");
}
console.log(`BOOSTER: ${cases} directional/refund/replay cases and interaction regressions passed`);
for (const charges of [1, 2, 99]) {
  const s = fixture();
  s.boosterMoves.red = charges;
  s.shieldTurns = { red: 4, blue: 0, green: 0, yellow: 0 };
  s.meteors = [{ r: 3, c: 4, id: 9, owner: "blue", size: "large" }];
  const n = applyMove(s, { r: 3, c: 4 });
  assert.equal(n.boosterMoves.red, charges - 1);
  assert.equal(n.shieldTurns?.red, 4, "shield does not block or get consumed by ramming");
  s.meteors = [];
  for (const turns of [-1, 1, 99]) {
    s.obstacles = [{ r: 3, c: 4, id: 10, owner: "blue", turns }];
    assert.deepEqual(applyMove(s, { r: 3, c: 5 }).obstacles, s.obstacles);
  }
}
