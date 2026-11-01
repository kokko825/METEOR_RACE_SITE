"use client";
/* eslint-disable react-hooks/set-state-in-effect -- hydrate cached rating before server refresh */

import { useCallback, useEffect, useRef, useState } from "react";
import { readLocal, parseStoredNumber } from "../client-storage";
import { getOrCreatePlayerId, playerRequestHeaders } from "../client-identity";
import { formatRegistryNumber } from "../registry-number";

export type ProfileStatus = "" | "synced" | "local" | "load-error" | "saving" | "saved" | "save-error";

/**
 * Device identity + 真剣タイマン rating, sourced from /api/profile (server
 * is authoritative for rating — see app/duel-rating.ts). Call
 * `refreshProfile()` again whenever a ranked match ends so the new rating
 * shows up.
 */
export function useProfile(onNicknameFromServer: (nickname: string) => void) {
  const [publicPlayerId, setPublicPlayerId] = useState("--------");
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>("");
  const [classicRankRating, setClassicRankRating] = useState(1200);
  const [itemRankRating, setItemRankRating] = useState(1200);
  const request = useRef<AbortController | null>(null);

  const refreshProfile = useCallback(() => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const playerId = getOrCreatePlayerId();
    return fetch("/api/profile", { headers: playerRequestHeaders(), cache: "no-store", signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error("Profile unavailable"); return response.json(); })
      .then((data) => {
        if (controller.signal.aborted) return;
        setPublicPlayerId(data.playerId ?? formatRegistryNumber(playerId.replace("player:", "")));
        if (data.nickname) onNicknameFromServer(data.nickname);
        setProfileStatus(data.synced ? "synced" : "local");
        // 真剣タイマンのレートはサーバーが権威（改ざん防止）。取得できた値で常に上書きする。
        if (Number.isFinite(data.classicRating)) setClassicRankRating(data.classicRating);
        if (Number.isFinite(data.itemRating)) setItemRankRating(data.itemRating);
      })
      .catch(() => { if (!controller.signal.aborted) setProfileStatus("load-error"); });
  }, [onNicknameFromServer]);

  useEffect(() => {
    // Offline-first cache: paint immediately from localStorage, then
    // refreshProfile() below corrects it from the server a moment later.
    const rating = (key: string, fallback = 1200) => parseStoredNumber(readLocal(key), fallback, 0, Number.MAX_SAFE_INTEGER);
    setClassicRankRating(rating("meteor-race-rank-classic", rating("meteor-race-rank-rating")));
    setItemRankRating(rating("meteor-race-rank-item"));
    void refreshProfile();
    return () => request.current?.abort();
  }, [refreshProfile]);

  return {
    publicPlayerId,
    profileStatus, setProfileStatus,
    classicRankRating, itemRankRating,
    refreshProfile,
  };
}
