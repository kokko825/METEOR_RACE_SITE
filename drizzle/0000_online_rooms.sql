CREATE TABLE `game_rooms` (
  `code` text PRIMARY KEY NOT NULL,
  `host_email` text NOT NULL,
  `guest_email` text,
  `state_json` text NOT NULL,
  `version` integer DEFAULT 1 NOT NULL,
  `status` text DEFAULT 'waiting' NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `game_rooms_updated_idx` ON `game_rooms` (`updated_at`);
