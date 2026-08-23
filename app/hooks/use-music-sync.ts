"use client";

import { useEffect, useRef, useState } from "react";
import { activePlayers, type GameState } from "../game-rules";
import { getMusicManager, type BattleTrackChoice, type MusicAssetConfig } from "../music-engine";
import { normalizeSiteConfig } from "../site-config";

type UseMusicSyncParams = {
  game: GameState;
  soundEnabled: boolean;
  masterVolume: number;
  bgmVolume: number;
  reducedMotion: boolean;
  battleTrack: BattleTrackChoice;
};

/**
 * Wires app/music-engine.ts's MusicManager up to site-config (shared theme
 * URLs), local volume/mute settings, the player's battle-track choice, and
 * the live game state (TENSION LEVEL 0-4 by distance-to-CORE, GOAL on win).
 * Pure side-effect hook — nothing here is read elsewhere in the UI.
 */
export function useMusicSync({ game, soundEnabled, masterVolume, bgmVolume, reducedMotion, battleTrack }: UseMusicSyncParams) {
  const [musicAssets, setMusicAssets] = useState<Partial<MusicAssetConfig>>({});
  const [musicEnabled, setMusicEnabled] = useState(true);
  const recordedGoalMusic = useRef("");

  // Load site-config (ads/music toggles + shared theme URLs), start the
  // engine on the first user gesture (autoplay policy).
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/site-config", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const config = normalizeSiteConfig(data.config);
        setMusicEnabled(Boolean(config.musicEnabled));
        setMusicAssets({
          titleUrl: config.musicTitleUrl,
          fanfareUrl: config.musicFanfareUrl,
          waitingUrl: config.musicWaitingUrl,
          gameStartSeUrl: config.musicGameStartSeUrl,
          battleTrackBaseUrls: {
            meteor: config.musicMeteorBaseUrl,
            orbit: config.musicOrbitBaseUrl,
            zero_gravity: config.musicZeroGravityBaseUrl,
            cosmic_error: config.musicCosmicErrorBaseUrl,
          },
          crossfadeMs: config.musicCrossfadeMs,
          bpm: config.musicBpm,
          beatsPerBar: config.musicBeatsPerBar,
        });
      })
      .catch(() => {});
    const manager = getMusicManager();
    const startOnGesture = () => manager.start();
    window.addEventListener("pointerdown", startOnGesture, { once: true });
    window.addEventListener("keydown", startOnGesture, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener("pointerdown", startOnGesture);
      window.removeEventListener("keydown", startOnGesture);
    };
  }, []);

  useEffect(() => {
    getMusicManager().configure({ ...musicAssets, crossfadeMs: reducedMotion ? 120 : musicAssets.crossfadeMs });
  }, [musicAssets, reducedMotion]);

  useEffect(() => {
    getMusicManager().setEnabled(musicEnabled && soundEnabled);
  }, [musicEnabled, soundEnabled]);

  useEffect(() => {
    getMusicManager().setVolume(masterVolume, bgmVolume);
  }, [masterVolume, bgmVolume]);

  useEffect(() => {
    getMusicManager().setBattleTrack(battleTrack);
  }, [battleTrack]);

  useEffect(() => {
    // TENSION LEVEL 0-4 follows the nearest-to-CORE active player (spec §7).
    if (game.phase === "over") {
      const key = `${game.turnCount}-${game.log.length}-${game.winner ?? ""}`;
      if (recordedGoalMusic.current !== key) {
        recordedGoalMusic.current = key;
        getMusicManager().dispatch({ type: "GOAL" });
      }
      return;
    }
    const mid = Math.floor(game.size / 2);
    const distances = activePlayers(game).map((player) => {
      const probe = game.probes[player];
      return Math.abs(probe.r - mid) + Math.abs(probe.c - mid);
    });
    const nearest = Math.min(...distances);
    const level = nearest <= 1 ? 4 : nearest === 2 ? 3 : nearest === 3 ? 2 : nearest === 4 ? 1 : 0;
    getMusicManager().dispatch({ type: "TENSION_CHANGED", level: level as 0 | 1 | 2 | 3 | 4 });
  }, [game]);
}
