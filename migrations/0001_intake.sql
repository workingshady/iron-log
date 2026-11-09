CREATE TABLE `intake` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`item` text NOT NULL,
	`amount` real NOT NULL,
	`unit` text NOT NULL,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `intake_date` ON `intake` (`item`,`date`);