"use client";
/* eslint-disable react-hooks/set-state-in-effect -- one-time hydration from browser storage */

import { useEffect, useState } from "react";
import type { BattleTrackChoice } from "../music-engine";

/**
 * Client-only display/sound preferences, persisted to localStorage.
 * Owns the nickname value too (even though it can also be updated from the
 * server via useProfile) so there is exactly one place that writes
 * "meteor-race-nickname".
 */
export function useLocalSettings() {
  const [nickname, setNickname] = useState("");
  const [masterVolume, setMasterVolume] = useState(80);
  const [bgmVolume, setBgmVolume] = useState(65);
  const [sfxVolume, setSfxVolume] = useState(80);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [battleTrack, setBattleTrack] = useState<BattleTrackChoice>("random");

  useEffect(() => {
    setNickname(window.localStorage.getItem("meteor-race-nickname") ?? "");
    setMasterVolume(Number(window.localStorage.getItem("meteor-race-master-volume") ?? 80));
    setBgmVolume(Number(window.localStorage.getItem("meteor-race-bgm-volume") ?? 65));
    setSfxVolume(Number(window.localStorage.getItem("meteor-race-sfx-volume") ?? 80));
    setReducedMotion(window.localStorage.getItem("meteor-race-reduced-motion") === "1");
    const storedTrack = window.localStorage.getItem("meteor-race-battle-track");
    if (storedTrack) setBattleTrack(storedTrack as BattleTrackChoice);
  }, []);
  useEffect(() => { window.localStorage.setItem("meteor-race-nickname", nickname); }, [nickname]);
  useEffect(() => { window.localStorage.setItem("meteor-race-master-volume", String(masterVolume)); }, [masterVolume]);
  useEffect(() => { window.localStorage.setItem("meteor-race-bgm-volume", String(bgmVolume)); }, [bgmVolume]);
  useEffect(() => { window.localStorage.setItem("meteor-race-sfx-volume", String(sfxVolume)); }, [sfxVolume]);
  useEffect(() => { window.localStorage.setItem("meteor-race-reduced-motion", reducedMotion ? "1" : "0"); }, [reducedMotion]);
  useEffect(() => { window.localStorage.setItem("meteor-race-battle-track", battleTrack); }, [battleTrack]);

  return {
    nickname, setNickname,
    masterVolume, setMasterVolume,
    bgmVolume, setBgmVolume,
    sfxVolume, setSfxVolume,
    reducedMotion, setReducedMotion,
    battleTrack, setBattleTrack,
  };
}
