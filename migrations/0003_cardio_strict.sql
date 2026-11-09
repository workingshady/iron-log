CREATE TABLE `cardio` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`protocol` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer,
	`ended_at` integer,
	`minutes` real,
	`distance_km` real,
	`kcal_machine` integer,
	`kcal_est` integer,
	`rpe` integer,
	`speed_adj` real,
	`note` text,
	`session_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cardio_date` ON `cardio` (`date`);--> statement-breakpoint
ALTER TABLE `sets` ADD `strict` integer;