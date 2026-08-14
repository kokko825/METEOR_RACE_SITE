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
