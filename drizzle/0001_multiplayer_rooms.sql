ALTER TABLE `game_rooms` ADD `player3_email` text;
--> statement-breakpoint
ALTER TABLE `game_rooms` ADD `player4_email` text;
--> statement-breakpoint
ALTER TABLE `game_rooms` ADD `max_players` integer DEFAULT 2 NOT NULL;
--> statement-breakpoint
ALTER TABLE `game_rooms` ADD `seat_order_json` text DEFAULT '["red","blue"]' NOT NULL;
