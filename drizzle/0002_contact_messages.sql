CREATE TABLE `contact_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`player_id` text NOT NULL,
	`email` text,
	`nickname` text,
	`category` text NOT NULL,
	`message` text NOT NULL,
	`site_version` text NOT NULL,
	`room_code` text,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `contact_messages_created_idx` ON `contact_messages` (`created_at`);
