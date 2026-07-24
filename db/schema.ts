import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const gameRooms = sqliteTable("game_rooms", {
  code: text("code").primaryKey(),
  hostEmail: text("host_email").notNull(),
  guestEmail: text("guest_email"),
  stateJson: text("state_json").notNull(),
  version: integer("version").notNull().default(1),
  status: text("status").notNull().default("waiting"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
