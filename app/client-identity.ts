"use client";

const PLAYER_ID_STORAGE_KEY = "meteor-race-player-id";

export function getOrCreatePlayerId() {
  let playerId = window.localStorage.getItem(PLAYER_ID_STORAGE_KEY);
  if (!playerId) {
    playerId = `player:${crypto.randomUUID()}`;
    window.localStorage.setItem(PLAYER_ID_STORAGE_KEY, playerId);
  }
  return playerId;
}

export function playerRequestHeaders(includeJson = false) {
  return {
    ...(includeJson ? { "Content-Type": "application/json" } : {}),
    "x-meteor-player-id": getOrCreatePlayerId(),
  };
}
