"use client";
/* eslint-disable react-hooks/set-state-in-effect -- one-time hydration from browser storage */

import { useEffect, useState } from "react";
import { BATTLE_TRACK_LABELS, type BattleTrackChoice } from "../music-engine";

export type SiteLanguage = "ja" | "en";
export type TextSize = "standard" | "large" | "xlarge";

function storedNumber(key: string, fallback: number) {
  const stored = window.localStorage.getItem(key);
  if (stored === null || stored.trim() === "") return fallback;
  const value = Number(stored);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : fallback;
}

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
  const [language, setLanguage] = useState<SiteLanguage>("ja");
  const [textSize, setTextSize] = useState<TextSize>("standard");
  const [strongPlaySharing, setStrongPlaySharing] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setNickname((window.localStorage.getItem("meteor-race-nickname") ?? "").slice(0, 16));
    setMasterVolume(storedNumber("meteor-race-master-volume", 80));
    setBgmVolume(storedNumber("meteor-race-bgm-volume", 65));
    setSfxVolume(storedNumber("meteor-race-sfx-volume", 80));
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(motionPreference.matches);
    const storedTrack = window.localStorage.getItem("meteor-race-battle-track");
    if (storedTrack !== null && (storedTrack === "random" || Object.hasOwn(BATTLE_TRACK_LABELS, storedTrack))) {
      setBattleTrack(storedTrack as BattleTrackChoice);
    }
    if (window.localStorage.getItem("meteor-race-language") === "en") setLanguage("en");
    const storedTextSize = window.localStorage.getItem("meteor-race-text-size");
    if (storedTextSize === "large" || storedTextSize === "xlarge") setTextSize(storedTextSize);
    setStrongPlaySharing(window.localStorage.getItem("meteor-race-strong-play-sharing") !== "0");
    setHydrated(true);
  }, []);
  useEffect(() => { if (hydrated) window.localStorage.setItem("meteor-race-nickname", nickname); }, [hydrated, nickname]);
  useEffect(() => { if (hydrated) window.localStorage.setItem("meteor-race-master-volume", String(masterVolume)); }, [hydrated, masterVolume]);
  useEffect(() => { if (hydrated) window.localStorage.setItem("meteor-race-bgm-volume", String(bgmVolume)); }, [hydrated, bgmVolume]);
  useEffect(() => { if (hydrated) window.localStorage.setItem("meteor-race-sfx-volume", String(sfxVolume)); }, [hydrated, sfxVolume]);
  useEffect(() => { if (hydrated) window.localStorage.setItem("meteor-race-battle-track", battleTrack); }, [hydrated, battleTrack]);
  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem("meteor-race-language", language);
    document.documentElement.lang = language;
  }, [hydrated, language]);
  useEffect(() => { if (hydrated) window.localStorage.setItem("meteor-race-strong-play-sharing", strongPlaySharing ? "1" : "0"); }, [hydrated, strongPlaySharing]);
  useEffect(() => { if (hydrated) window.localStorage.setItem("meteor-race-text-size", textSize); }, [hydrated, textSize]);

  return {
    nickname, setNickname,
    masterVolume, setMasterVolume,
    bgmVolume, setBgmVolume,
    sfxVolume, setSfxVolume,
    reducedMotion,
    battleTrack, setBattleTrack,
    language, setLanguage,
    textSize, setTextSize,
    strongPlaySharing, setStrongPlaySharing,
  };
}
