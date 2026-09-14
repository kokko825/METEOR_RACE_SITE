import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PlayerStack } from "../app/components/game-pieces";
import { VolumeControls } from "../app/components/sound-controls";
import { RulesArchive, WorldArchive } from "../app/components/manual-content";
import { activePlayers, initialGameState } from "../app/game-rules";
import { DEFAULT_BALANCE } from "../app/balance-config";

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
  assert.ok(world.includes("CORE APPROACH 60%") && world.includes("authorized-equipment"));
}
console.log("ui-components: rendered controls, loadout privacy, players and manuals passed");
