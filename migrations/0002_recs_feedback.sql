CREATE TABLE `feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`ex_key` text NOT NULL,
	`effort` text,
	`joints` text,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `feedback_ex` ON `feedback` (`ex_key`,`at`);--> statement-breakpoint
ALTER TABLE `sets` ADD `suggested` text;--> statement-breakpoint
ALTER TABLE `sets` ADD `pr` integer DEFAULT 0 NOT NULL;