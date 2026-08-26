CREATE TABLE `strong_plays` (
	`id` text PRIMARY KEY NOT NULL,
	`app_version` text NOT NULL,
	`difficulty` text NOT NULL,
	`variant` text NOT NULL,
	`board_size` integer NOT NULL,
	`player_count` integer NOT NULL,
	`winner` text NOT NULL,
	`actor` text NOT NULL,
	`category` text NOT NULL,
	`score` integer NOT NULL,
	`play_json` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_strong_plays_category_created` ON `strong_plays` (`category`, `created_at`);
