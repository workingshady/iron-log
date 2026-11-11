CREATE TABLE `photos` (
	`id` text PRIMARY KEY NOT NULL,
	`ref_kind` text NOT NULL,
	`ref_id` text,
	`ex_key` text,
	`session_id` text,
	`date` text NOT NULL,
	`caption` text,
	`mime` text NOT NULL,
	`w` integer,
	`h` integer,
	`bytes` integer,
	`data` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `photos_ref` ON `photos` (`ref_id`);--> statement-breakpoint
CREATE INDEX `photos_ex` ON `photos` (`ex_key`);--> statement-breakpoint
CREATE INDEX `photos_date` ON `photos` (`date`);