"use client";
/* eslint-disable react-hooks/set-state-in-effect -- hydrate cached rating before server refresh */

import { useEffect, useState } from "react";

/**
 * Device identity + 真剣タイマン rating, sourced from /api/profile (server
 * is authoritative for rating — see app/duel-rating.ts). Call
 * `refreshProfile()` again whenever a ranked match ends so the new rating
 * shows up.
 */
export function useProfile(onNicknameFromServer: (nickname: string) => void) {
  const [profileEmail, setProfileEmail] = useState("未連携");
  const [publicPlayerId, setPublicPlayerId] = useState("--------");
  const [profileStatus, setProfileStatus] = useState("");
  const [classicRankRating, setClassicRankRating] = useState(1200);
  const [itemRankRating, setItemRankRating] = useState(1200);

  const refreshProfile = () => {
    let playerId = window.localStorage.getItem("meteor-race-player-id");
    if (!playerId) {
      playerId = `player:${crypto.randomUUID()}`;
      window.localStorage.setItem("meteor-race-player-id", playerId);
    }
    return fetch("/api/profile", { headers: { "x-meteor-player-id": playerId }, cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        setProfileEmail(data.email ?? "未連携");
        setPublicPlayerId(data.playerId ?? playerId.replace("player:", "").slice(0, 8).toUpperCase());
        if (data.nickname) onNicknameFromServer(data.nickname);
        setProfileStatus(data.synced ? "アカウント間で同期中" : "この端末に保存");
        // 真剣タイマンのレートはサーバーが権威（改ざん防止）。取得できた値で常に上書きする。
        if (Number.isFinite(data.classicRating)) setClassicRankRating(data.classicRating);
        if (Number.isFinite(data.itemRating)) setItemRankRating(data.itemRating);
      })
      .catch(() => setProfileEmail("未連携"));
  };

  useEffect(() => {
    // Offline-first cache: paint immediately from localStorage, then
    // refreshProfile() below corrects it from the server a moment later.
    const legacyRank = Number(window.localStorage.getItem("meteor-race-rank-rating"));
    const storedClassic = Number(window.localStorage.getItem("meteor-race-rank-classic"));
    const storedItem = Number(window.localStorage.getItem("meteor-race-rank-item"));
    if (Number.isFinite(storedClassic) && storedClassic >= 0) setClassicRankRating(storedClassic);
    else if (Number.isFinite(legacyRank) && legacyRank >= 0) setClassicRankRating(legacyRank);
    if (Number.isFinite(storedItem) && storedItem >= 0) setItemRankRating(storedItem);
    void refreshProfile();
  }, []);

  return {
    profileEmail, publicPlayerId,
    profileStatus, setProfileStatus,
    classicRankRating, itemRankRating,
    refreshProfile,
  };
}
