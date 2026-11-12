CREATE TABLE `challenge_members` (
	`challenge_id` text NOT NULL,
	`user_id` text NOT NULL,
	`joined_at` integer NOT NULL,
	PRIMARY KEY(`challenge_id`, `user_id`)
);
--> statement-breakpoint
CREATE INDEX `chm_user` ON `challenge_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`created_by` text NOT NULL,
	`title` text NOT NULL,
	`metric` text NOT NULL,
	`target` real,
	`muscle` text,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`visibility` text DEFAULT 'friends' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `challenges_end` ON `challenges` (`end_date`);