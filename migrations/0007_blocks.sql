CREATE TABLE `blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`n` integer NOT NULL,
	`name` text NOT NULL,
	`program_id` text NOT NULL,
	`start_version` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`status` text NOT NULL,
	`goal` text,
	`notes` text,
	`review` text,
	`baseline` text,
	`summary` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `sessions` ADD `block_id` text;--> statement-breakpoint
CREATE INDEX `sessions_block` ON `sessions` (`block_id`);