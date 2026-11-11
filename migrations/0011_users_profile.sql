CREATE TABLE `login_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`fails` integer NOT NULL,
	`until` integer,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`name` text,
	`bio` text,
	`avatar_id` text,
	`pass_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username` ON `users` (`username`);--> statement-breakpoint
ALTER TABLE `photos` ADD `thumb` text;