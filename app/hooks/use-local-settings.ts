"use client";
/* eslint-disable react-hooks/set-state-in-effect -- one-time hydration from browser storage */

import { useEffect, useState } from "react";
import { BATTLE_TRACK_LABELS, type BattleTrackChoice } from "../music-engine";
import { UI_BEHAVIOR } from "../../config/ui-behavior";
import { readLocal, writeLocal, parseStoredNumber } from "../client-storage";

export type SiteLanguage = "ja" | "en";
export type TextSize = "standard" | "large" | "xlarge";

function storedNumber(key: string, fallback: number) {
  return parseStoredNumber(readLocal(key), fallback);
}

/** Read-only documents must not rewrite unrelated game preferences. */
export function useSiteLanguage() {
  const [language, setLanguage] = useState<SiteLanguage>("ja");
  useEffect(() => {
    const update = () => { const next = readLocal("meteor-race-language") === "en" ? "en" : "ja"; setLanguage(next); document.documentElement.lang = next; };
    update();
    window.addEventListener("storage", update);
    return () => window.removeEventListener("storage", update);
  }, []);
  return language;
}

/**
 * Client-only display/sound preferences, persisted to localStorage.
 * Owns the nickname value too (even though it can also be updated from the
 * server via useProfile) so there is exactly one place that writes
 * "meteor-race-nickname".
 */
export function useLocalSettings() {
  const [nickname, setNickname] = useState("");
  const [masterVolume, setMasterVolume] = useState<number>(UI_BEHAVIOR.defaultVolumes.master);
  const [bgmVolume, setBgmVolume] = useState<number>(UI_BEHAVIOR.defaultVolumes.bgm);
  const [sfxVolume, setSfxVolume] = useState<number>(UI_BEHAVIOR.defaultVolumes.sfx);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [effectsDisabled, setEffectsDisabled] = useState(false);
  const [battleTrack, setBattleTrack] = useState<BattleTrackChoice>("random");
  const [language, setLanguage] = useState<SiteLanguage>("ja");
  const [textSize, setTextSize] = useState<TextSize>("standard");
  const [strongPlaySharing, setStrongPlaySharing] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setNickname((readLocal("meteor-race-nickname") ?? "").slice(0, 16));
    setMasterVolume(storedNumber("meteor-race-master-volume", UI_BEHAVIOR.defaultVolumes.master));
    setBgmVolume(storedNumber("meteor-race-bgm-volume", UI_BEHAVIOR.defaultVolumes.bgm));
    setSfxVolume(storedNumber("meteor-race-sfx-volume", UI_BEHAVIOR.defaultVolumes.sfx));
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(motionPreference.matches);
    const updateMotion = () => setReducedMotion(motionPreference.matches);
    motionPreference.addEventListener("change", updateMotion);
    setEffectsDisabled(readLocal("meteor-race-effects") === "off");
    const storedTrack = readLocal("meteor-race-battle-track");
    if (storedTrack !== null && (storedTrack === "random" || Object.hasOwn(BATTLE_TRACK_LABELS, storedTrack))) {
      setBattleTrack(storedTrack as BattleTrackChoice);
    }
    if (readLocal("meteor-race-language") === "en") setLanguage("en");
    const storedTextSize = readLocal("meteor-race-text-size");
    if (storedTextSize === "large" || storedTextSize === "xlarge") setTextSize(storedTextSize);
    setStrongPlaySharing(readLocal("meteor-race-strong-play-sharing") !== "0");
    setHydrated(true);
    return () => motionPreference.removeEventListener("change", updateMotion);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    const values = { nickname, "master-volume": masterVolume, "bgm-volume": bgmVolume, "sfx-volume": sfxVolume, "battle-track": battleTrack, language, "strong-play-sharing": strongPlaySharing ? "1" : "0", "text-size": textSize, effects: effectsDisabled ? "off" : "on" };
    for (const [key, value] of Object.entries(values)) writeLocal(`meteor-race-${key}`, String(value));
    document.documentElement.lang = language;
  }, [hydrated, nickname, masterVolume, bgmVolume, sfxVolume, battleTrack, language, strongPlaySharing, textSize, effectsDisabled]);

  return {
    nickname, setNickname,
    masterVolume, setMasterVolume,
    bgmVolume, setBgmVolume,
    sfxVolume, setSfxVolume,
    reducedMotion,
    effectsDisabled, setEffectsDisabled,
    battleTrack, setBattleTrack,
    language, setLanguage,
    textSize, setTextSize,
    strongPlaySharing, setStrongPlaySharing,
  };
}
