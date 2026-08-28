"use client";
/* eslint-disable react-hooks/set-state-in-effect -- hydrate cached rating before server refresh */

import { useCallback, useEffect, useState } from "react";
import { getOrCreatePlayerId, playerRequestHeaders } from "../client-identity";
import { formatRegistryNumber } from "../registry-number";

/**
 * Device identity + 真剣タイマン rating, sourced from /api/profile (server
 * is authoritative for rating — see app/duel-rating.ts). Call
 * `refreshProfile()` again whenever a ranked match ends so the new rating
 * shows up.
 */
export function useProfile(onNicknameFromServer: (nickname: string) => void) {
  const [publicPlayerId, setPublicPlayerId] = useState("--------");
  const [profileStatus, setProfileStatus] = useState("");
  const [classicRankRating, setClassicRankRating] = useState(1200);
  const [itemRankRating, setItemRankRating] = useState(1200);

  const refreshProfile = useCallback(() => {
    const playerId = getOrCreatePlayerId();
    return fetch("/api/profile", { headers: playerRequestHeaders(), cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        setPublicPlayerId(data.playerId ?? formatRegistryNumber(playerId.replace("player:", "")));
        if (data.nickname) onNicknameFromServer(data.nickname);
        setProfileStatus(data.synced ? "アカウント間で同期中" : "この端末に保存");
        // 真剣タイマンのレートはサーバーが権威（改ざん防止）。取得できた値で常に上書きする。
        if (Number.isFinite(data.classicRating)) setClassicRankRating(data.classicRating);
        if (Number.isFinite(data.itemRating)) setItemRankRating(data.itemRating);
      })
      .catch(() => setProfileStatus("登録情報を確認できませんでした"));
  }, [onNicknameFromServer]);

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
  }, [refreshProfile]);

  return {
    publicPlayerId,
    profileStatus, setProfileStatus,
    classicRankRating, itemRankRating,
    refreshProfile,
  };
}
