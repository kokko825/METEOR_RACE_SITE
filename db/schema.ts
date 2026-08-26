import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const gameRooms = sqliteTable("game_rooms", {
  code: text("code").primaryKey(),
  hostEmail: text("host_email").notNull(),
  guestEmail: text("guest_email"),
  player3Email: text("player3_email"),
  player4Email: text("player4_email"),
  maxPlayers: integer("max_players").notNull().default(2),
  seatOrderJson: text("seat_order_json").notNull().default('["red","blue"]'),
  stateJson: text("state_json").notNull(),
  version: integer("version").notNull().default(1),
  status: text("status").notNull().default("waiting"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const balanceSettings = sqliteTable("balance_settings", {
  id: integer("id").primaryKey(),
  publishedJson: text("published_json").notNull(),
  draftJson: text("draft_json").notNull(),
  previousJson: text("previous_json").notNull(),
  revision: integer("revision").notNull().default(1),
  updatedAt: integer("updated_at").notNull(),
});

export const siteSettings = sqliteTable("site_settings", {
  id: integer("id").primaryKey(),
  publishedJson: text("published_json").notNull(),
  draftJson: text("draft_json").notNull(),
  previousJson: text("previous_json").notNull(),
  revision: integer("revision").notNull().default(1),
  updatedAt: integer("updated_at").notNull(),
});

export const playerProfiles = sqliteTable("player_profiles", {
  identityKey: text("identity_key").primaryKey(),
  nickname: text("nickname").notNull().default(""),
  updatedAt: integer("updated_at").notNull(),
});

export const duelRatings = sqliteTable("duel_ratings", {
  identityKey: text("identity_key").primaryKey(),
  classicRating: integer("classic_rating").notNull().default(1200),
  itemRating: integer("item_rating").notNull().default(1200),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
});

export const rateLimits = sqliteTable("rate_limits", {
  bucketKey: text("bucket_key").primaryKey(),
  windowStart: integer("window_start").notNull(),
  count: integer("count").notNull(),
});

export const contactMessages = sqliteTable("contact_messages", {
  id: text("id").primaryKey(),
  playerId: text("player_id").notNull(),
  email: text("email"),
  nickname: text("nickname"),
  category: text("category").notNull(),
  message: text("message").notNull(),
  siteVersion: text("site_version").notNull(),
  roomCode: text("room_code"),
  status: text("status").notNull().default("new"),
  createdAt: integer("created_at").notNull(),
});

export const strongPlays = sqliteTable("strong_plays", {
  id: text("id").primaryKey(),
  appVersion: text("app_version").notNull(),
  difficulty: text("difficulty").notNull(),
  variant: text("variant").notNull(),
  boardSize: integer("board_size").notNull(),
  playerCount: integer("player_count").notNull(),
  winner: text("winner").notNull(),
  actor: text("actor").notNull(),
  category: text("category").notNull(),
  score: integer("score").notNull(),
  playJson: text("play_json").notNull(),
  createdAt: integer("created_at").notNull(),
});
