// Offline, deterministic A/B/C matches. Experimental rules never enter the app.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import ts from "typescript";

const policy = process.env.BOOST_POLICY ?? "crush-hop";
const matrix = process.env.BOOST_MATRIX === "1";
assert.ok(["baseline", "crush-hop", "crush-block"].includes(policy));
const root = path.resolve(".cache/tests/booster-comparison", policy + (matrix ? "-matrix" : ""));
const files = ["app/game-rules.ts", "app/ai-engine.ts", "app/balance-config.ts", "config/game-balance.ts", "config/ai-strategy.ts", "config/match-events.ts"];
for (const file of files) {
  let source = fs.readFileSync(file, "utf8");
  if (file === "app/game-rules.ts") {
    if (policy === "baseline") source = execFileSync("git", ["show", "2cd978d2fa1cd36fedff543918c97759f67c84bd:app/game-rules.ts"], { encoding: "utf8" });
    if (policy === "crush-block") source = source.replace("const canJumpObstacle = maxSteps > 1", "const canJumpObstacle = false && maxSteps > 1");
  }
  const dest = path.join(root, file.replace(/\.ts$/, ".js"));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText.replace(/from "(\.[^"]+)(?<!\.js)"/g, 'from "$1.js"'));
}
const r = await import(pathToFileURL(path.join(root, "app/game-rules.js")));
const { chooseAiDecision } = await import(pathToFileURL(path.join(root, "app/ai-engine.js")));
const items = r.SELECTABLE_ITEMS;
const hands = [];
for (let a = 0; a < items.length; a++) for (let b = a; b < items.length; b++) for (let c = b; c < items.length; c++) {
  if (a !== c) hands.push([items[a], items[b], items[c]]);
}
assert.equal(hands.length, 50);
const events = ["off", "wind", "orbit", "geyser", "gravity", "warp", ["wind", "orbit", "geyser", "gravity", "warp"]];
const results = [];
const games = Number(process.env.BOOST_GAMES ?? 108);
for (let g = 0; g < games; g++) {
  const ranked = matrix && g >= 32;
  const mode = ranked ? 0 : g % 4;
  const count = mode === 3 ? 4 : mode + 2;
  const size = [11, 13, 15][Math.floor(g / 4) % 3];
  const difficulty = matrix ? "normal" : ["easy", "normal", "hard"][Math.floor(g / 12) % 3];
  const event = matrix ? (ranked ? "off" : ["wind", "orbit", "geyser", "gravity", "warp"].filter((_, i) => g & (1 << i))) : events[Math.floor(g / 3) % events.length];
  let seed = 12345 + g * 9871;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  let s = r.initialGameState(size, "red", count, false, g % 4, [], mode === 3 ? "team-item" : "item", undefined, ranked, event, g + 1, 3 + g % 5);
  // Deterministic valid loadouts span all 50 multisets, without setup preference bias.
  s.phase = "move";
  s.itemHands = Object.fromEntries(s.players.map((p, i) => [p, [...hands[(g + i * 13) % hands.length]]]));
  const boosters = Object.fromEntries(s.players.map(p => [p, s.itemHands[p].filter(k => k === "booster").length]));
  let actions = 0, crushed = 0, boosts = 0, used = 0;
  while (s.phase !== "over" && actions < 800) {
    const before = s;
    const d = chooseAiDecision(s, difficulty, random);
    if (d.type === "move") {
      s = r.applyMove(s, d.target);
      crushed += before.meteors.filter(m => !s.meteors.some(n => n.id === m.id)).length;
      boosts += Math.max(0, before.boosterMoves[before.turn] - s.boosterMoves[before.turn]);
    } else if (d.type === "meteor") s = r.applyMeteor(s, d.target, d.size, d.useCapsule).state;
    else if (d.type === "item") { s = r.applyUseItem(s, d.kind); if (d.kind === "booster") used++; }
    else if (d.type === "pass") s = r.applyPass(s);
    else if (d.type === "holo") s = r.applyHoloSwitch(s, d.target);
    else if (d.type === "blast") s = r.applyBlastSwitch(s, d.target);
    else if (d.type === "pulse") s = r.applyPulseSwitch(s, d.target);
    else if (d.type === "recall") s = r.applyRecallItem(s, d.meteorId);
    else if (s.phase === "move" && !r.legalMoves(s).length) s = r.skipBlockedMove(s);
    else if (d.type === "skip" && s.phase === "place") s = r.finishTurn(s, "AI skip");
    else throw new Error(`Unhandled ${JSON.stringify(d)}`);
    assert.notDeepEqual(s, before, `stuck game ${g}`);
    for (const p of r.activePlayers(s)) {
      assert.ok(!s.meteors.some(m => r.samePos(m, s.probes[p])), `probe/meteor overlap ${g}`);
      assert.ok(s.inventory[p].small >= 0 && s.inventory[p].large >= 0);
    }
    actions++;
  }
  assert.equal(s.phase, "over", `unfinished game ${g}`);
  results.push({ game: g, mode, size: s.size, difficulty, event, ranked, turns: s.turnCount, winner: s.winner, boosters, crushed, boosts, used });
  fs.writeFileSync(path.join(root, "progress.json"), JSON.stringify(results));
  if ((g + 1) % 6 === 0) console.log(`${policy}: ${g + 1}/${games}`);
}
const summary = { policy, games, meanTurns: results.reduce((n, v) => n + v.turns, 0) / games, draws: results.filter(v => v.winner === "draw").length, crushed: results.reduce((n,v)=>n+v.crushed,0), boosts: results.reduce((n,v)=>n+v.boosts,0), activations: results.reduce((n,v)=>n+v.used,0) };
fs.writeFileSync(path.join(root, "results.json"), JSON.stringify({ summary, results }, null, 2));
console.log(JSON.stringify(summary));
