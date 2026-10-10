import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EventBoardEffect, EventControls, EventStatus, EventSummary, forecastStyle, upcomingEvents, eventCellClass } from "../app/components/match-events";
import { PlayerStack, ProbeToken } from "../app/components/game-pieces";
import { VolumeControls } from "../app/components/sound-controls";
import { RulesArchive, WorldArchive } from "../app/components/manual-content";
import { activePlayers, initialGameState } from "../app/game-rules";
import { DEFAULT_BALANCE } from "../app/balance-config";
import { LoadoutPreview } from "../app/components/loadout-preview";
import { boardTargetPreview, beforeFieldEvents } from "../app/board-preview";
import { gameStatusText } from "../app/game-status";
import { minutesUntilRanked } from "../app/ranked-schedule";

const noop = () => {};
for (const language of ["ja", "en"] as const) {
  for (const compact of [false, true]) {
    for (const musicEnabled of [false, true]) {
      const html = renderToStaticMarkup(createElement(VolumeControls, {
        language, compact, musicEnabled, masterVolume: 81, bgmVolume: 65, sfxVolume: 37,
        setMasterVolume: noop, setBgmVolume: noop, setSfxVolume: noop, onTick: noop,
      }));
      assert.equal((html.match(/type="range"/g) ?? []).length, musicEnabled ? 3 : 2);
      assert.equal(html.includes('aria-label="BGM"'), musicEnabled);
      assert.equal((html.match(/step="1"/g) ?? []).length, musicEnabled ? 3 : 2);
      for (const value of musicEnabled ? [81, 65, 37] : [81, 37]) {
        assert.ok(html.includes(`value="${value}"`));
        assert.ok(html.includes(`<output>${value}</output>`));
      }
    }
  }
  for (const variant of ["classic", "item", "team", "team-item"] as const) {
    for (const count of [2, 3, 4] as const) {
      const game = initialGameState(13, "red", count, false, 0, [], variant);
      game.itemHands = Object.fromEntries(["red", "blue", "green", "yellow"].map((p) => [p, ["booster", "booster", "shield"]])) as typeof game.itemHands;
      for (const visible of [true, false]) {
        const names: string[] = [];
        const html = ["left", "right"].map((side) => renderToStaticMarkup(createElement(PlayerStack, {
          side: side as "left" | "right", game, resultVisible: false, language,
          displayName: (player, index) => { names.push(`${player}:${index}`); return player; },
          canSeeLoadout: () => visible,
        }))).join("");
        assert.equal((html.match(/class="player-card /g) ?? []).length, activePlayers(game).length);
        assert.ok(names.includes("red:1") && names.includes("blue:2"));
        if (activePlayers(game).includes("green")) assert.ok(names.includes("green:3"));
        if (activePlayers(game).includes("yellow")) assert.ok(names.includes("yellow:4"));
        assert.equal(html.includes("inventory-item booster"), visible);
        assert.equal(html.includes("loadout-hidden"), !visible);
        assert.ok(html.includes('red-card active'));
      }
    }
  }
  const rules = renderToStaticMarkup(createElement(RulesArchive, { language, balance: DEFAULT_BALANCE }));
  assert.ok(rules.includes("manual-turn-loop") && rules.includes("manual-item-grid"));
  const world = renderToStaticMarkup(createElement(WorldArchive, { language, progress: 60 }));
  assert.ok(world.includes("INTERSTELLAR NETWORK") && world.includes("authorized-equipment"));
  assert.ok(rules.includes(language === "ja" ? "または" : "OR"));
  assert.ok(rules.includes("blast-diagram"));
  const loadout = renderToStaticMarkup(createElement(LoadoutPreview, { items: ["booster", "shield", "blast"], balance: DEFAULT_BALANCE, language }));
  assert.equal((loadout.match(/<details /g) ?? []).length, 3);
  assert.ok(loadout.includes("loadout-rows"));
  assert.equal((loadout.match(/class="loadout-card-description"/g) ?? []).length, 3);
  assert.ok(loadout.includes('class="loadout-row blast"'));
  for (const item of ["shield", "booster", "holo", "orbit", "blast", "pulse", "recall"] as const) {
    const row = renderToStaticMarkup(createElement(LoadoutPreview, { items: [item], balance: DEFAULT_BALANCE, language }));
    assert.ok(row.includes('class="loadout-emblem"') && row.includes('class="loadout-copy"'));
    assert.ok(row.includes('class="loadout-card-description"'));
  }
  const team = initialGameState(13, "red", 4, false, 0, [], "team");
  const left = renderToStaticMarkup(createElement(PlayerStack, { side: "left", game: team, resultVisible: false, language, displayName: p => p, canSeeLoadout: () => true }));
  assert.ok(left.includes("red-card") && left.includes("yellow-card"));
  assert.ok(!left.includes("green-card") && !left.includes("blue-card"));
}

const previewGame = initialGameState(11, "red", 2, false, 0, [], "item");
previewGame.phase = "move";
previewGame.turnCount = 2;
const original = JSON.stringify(previewGame);
const moved = boardTargetPreview(previewGame, { r: 8, c: 5 });
assert.deepEqual(moved?.probes.red, { r: 8, c: 5 });
assert.equal(JSON.stringify(previewGame), original, "preview must not consume or mutate live state");
assert.equal(boardTargetPreview(previewGame, { r: -1, c: 0 }), null);
previewGame.phase = "place";
const placed = boardTargetPreview(previewGame, { r: 10, c: 5 });
assert.deepEqual(placed?.probes.red, { r: 8, c: 5 });
assert.equal(previewGame.inventory.red.small, 2, "preview must not spend a meteor");
for (const kind of ["blast", "holo", "pulse"] as const) {
  const source = { ...previewGame, phase: "switch" as const, pendingSwitches: [{ kind, player: "red" as const }] };
  const before = JSON.stringify(source);
  const preview = boardTargetPreview(source, { r: 10, c: 5 });
  assert.ok(preview, `${kind} should support a target preview`);
  assert.equal(JSON.stringify(source), before, `${kind} preview must not mutate the live state`);
  if (kind === "blast") assert.ok(preview.probes.red.r < source.probes.red.r);
  if (kind === "holo") assert.ok(preview.obstacles.some(p => p.r === 10 && p.c === 5));
  if (kind === "pulse") assert.ok(preview.pulseDevices?.some(p => p.r === 10 && p.c === 5));
}
previewGame.phase = "move";
previewGame.pulseDevices = [{ r: 9, c: 4, owner: "blue", id: 77, turns: 4 }];
assert.match(gameStatusText(previewGame, "ja"), /PULSE.*移動できません/);
assert.match(gameStatusText(previewGame, "en"), /PULSE prevents movement/);
assert.equal(minutesUntilRanked(new Date("2026-10-10T22:59:00Z")), 1);
assert.equal(minutesUntilRanked(new Date("2026-10-10T23:00:00Z")), 0);
assert.equal(minutesUntilRanked(new Date("2026-10-11T00:00:00Z")), 660);
console.log("ui-components: rendered controls, loadout privacy, players and manuals passed");
for (const language of ["ja", "en"] as const) {
  const controls = renderToStaticMarkup(createElement(EventControls, { value: ["geyser"], onChange: noop, language, interval: { geyser: 5 }, onIntervalChange: noop }));
  assert.equal((controls.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.equal((controls.match(/aria-pressed="false"/g) ?? []).length, 4);
  assert.ok(!controls.includes('type="checkbox"'));
  assert.ok(controls.includes("AEQRIS"));
  const manual = renderToStaticMarkup(createElement(RulesArchive, { language, balance: DEFAULT_BALANCE }));
  assert.ok(manual.includes("manual-events"));
}
const token = renderToStaticMarkup(createElement(ProbeToken, { player: "red", rotation: 0 }));
assert.ok(!token.includes("probe-number"));
const status = renderToStaticMarkup(createElement(EventStatus, { language: "en", event: { kind: "geyser", kinds: ["geyser", "wind"], interval: 5, remaining: 3, seed: 1, acted: [], serial: 0 } }));
assert.ok(!status.includes("<details"));
assert.ok(status.includes("Geyser") && status.includes("Wind"));
const summary = renderToStaticMarkup(createElement(EventSummary, { language: "en", event: { kind: "geyser", kinds: ["geyser", "wind"], remaining: 3, seed: 1, acted: [], serial: 0 } }));
assert.ok(summary.includes("<summary>Event in 3 rounds</summary>"));
assert.ok(!summary.includes("<details open"));
assert.ok(summary.includes("Geyser") && summary.includes("Wind"));
const independentControls = renderToStaticMarkup(createElement(EventControls, { value: ["geyser", "wind"], onChange: noop, language: "en", interval: { geyser: 3, wind: 7 }, onIntervalChange: noop }));
assert.equal((independentControls.match(/<select/g) ?? []).length, 2);
assert.ok(independentControls.includes('aria-label="Geyser interval"'));
assert.ok(independentControls.includes('aria-label="Wind interval"'));
assert.ok(independentControls.includes('value="3" selected=""'));
assert.ok(independentControls.includes('value="7" selected=""'));
const independentStatus = renderToStaticMarkup(createElement(EventStatus, { language: "en", event: { kind: "geyser", kinds: ["geyser", "wind"], remaining: 3, seed: 1, acted: [], serial: 0, schedule: { geyser: { remaining: 3 }, wind: { remaining: 7 } } } }));
assert.match(independentStatus, /Geyser.* · 3 rounds/);
assert.match(independentStatus, /Wind.* · 7 rounds/);
const beforeEvent = initialGameState(9, "red");
const eventEnd = { ...beforeEvent, probes: { ...beforeEvent.probes, red: { r: 4, c: 4 } } };
eventEnd.matchEvent = { kind: "gravity", seed: 1, remaining: 5, acted: [], serial: 1, stages: [{ forecast: { kind: "gravity", target: { r: 4, c: 4 }, ring: 1, clockwise: true, dr: 0, dc: 0 }, before: beforeEvent, after: eventEnd }] };
assert.deepEqual(beforeFieldEvents(beforeEvent, eventEnd).probes.red, beforeEvent.probes.red);
assert.equal(beforeFieldEvents(eventEnd, eventEnd), eventEnd);
const forecastState = { kind: "orbit" as const, kinds: ["orbit", "geyser", "wind", "gravity"] as const, remaining: 1, seed: 1, serial: 0, acted: [] };
const timingState = { ...forecastState, kinds: [...forecastState.kinds], schedule: { orbit: { remaining: 2 }, geyser: { remaining: 2 }, wind: { remaining: 1 }, gravity: { remaining: 2 } } };
assert.deepEqual(upcomingEvents(timingState), ["wind", "orbit", "geyser", "gravity"]);
const strength = (s: ReturnType<typeof forecastStyle>, key: string) => Number((s as Record<string, unknown>)[key]);
const early = forecastStyle({ ...timingState, schedule: undefined, remaining: 2 }, 4);
const late = forecastStyle({ ...timingState, schedule: undefined, remaining: 1 }, 4);
assert.ok(strength(late, "--orbit-strength") > strength(early, "--orbit-strength"));
assert.ok(strength(early, "--wind-strength") > strength(early, "--geyser-strength"));
assert.ok(strength(early, "--gravity-strength") >= .35);
assert.deepEqual(forecastStyle(undefined, 0), {});
assert.deepEqual(forecastStyle({ ...timingState, kind: "off" }, 4), {});
assert.ok(strength(forecastStyle({ ...timingState, acted: ["red"] }, 4), "--wind-strength") > strength(forecastStyle(timingState, 4), "--wind-strength"));
const ventForecast = { kind: "geyser" as const, target: { r: 3, c: 3 }, vents: [{ r: 3, c: 3 }], ring: 2, clockwise: true, dr: 0, dc: 1 };
const ventEvent = { kind: "geyser" as const, seed: 1, serial: 0, acted: [], remaining: 2, forecast: ventForecast };
assert.match(eventCellClass(ventEvent, { r: 3, c: 3 }, 6), /event-vent-warning/);
assert.match(eventCellClass(ventEvent, { r: 3, c: 3 }, 6, [{ r: 3, c: 3 }]), /event-vent-blocked/);
assert.match(eventCellClass(ventEvent, { r: 3, c: 4 }, 6), /event-geyser-warning/);
assert.match(eventCellClass(ventEvent, { r: 3, c: 4 }, 6, [{ r: 3, c: 3 }]), /event-geyser-blocked/);
assert.match(eventCellClass({ ...ventEvent, forecasts: [ventForecast] }, { r: 3, c: 3 }, 6, [{ r: 3, c: 3 }]), /event-vent-blocked/);
assert.equal(eventCellClass(ventEvent, { r: 0, c: 0 }, 6), "");
{
  const forecast = { kind: "gravity" as const, target: { r: 3, c: 8 }, ring: 0, clockwise: true, dr: 0, dc: 0 };
  const event = { kind: "gravity" as const, seed: 1, remaining: 2, acted: [], serial: 0, forecast };
  assert.equal(eventCellClass(event, forecast.target, 6), "event-gravity-center");
  assert.equal(eventCellClass(event, { r: 5, c: 10 }, 6), "event-gravity-strong");
  assert.equal(eventCellClass(event, { r: 8, c: 8 }, 6), "event-gravity-weak");
  assert.equal(eventCellClass(event, { r: 9, c: 8 }, 6), "");
  for (const perspective of [0, 1, 2, 3]) {
    const html = renderToStaticMarkup(createElement(EventBoardEffect, { event, perspective, firing: false, size: 13 }));
    assert.ok(html.includes("gravity-core") && html.includes("translate(-50%, -50%)"));
    assert.ok(!html.includes("NaN"));
  }
}
