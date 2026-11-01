"use client";
import { readLocal, writeLocal } from "./client-storage";

const PLAYER_ID_STORAGE_KEY = "meteor-race-player-id";

export function getOrCreatePlayerId() {
  let playerId = readLocal(PLAYER_ID_STORAGE_KEY);
  if (!playerId) {
    playerId = `player:${crypto.randomUUID()}`;
    writeLocal(PLAYER_ID_STORAGE_KEY, playerId);
  }
  return playerId;
}

export function playerRequestHeaders(includeJson = false) {
  return {
    ...(includeJson ? { "Content-Type": "application/json" } : {}),
    "x-meteor-player-id": getOrCreatePlayerId(),
  };
}
