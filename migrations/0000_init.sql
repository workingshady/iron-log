CREATE TABLE `body` (
	`date` text PRIMARY KEY NOT NULL,
	`weight_kg` real,
	`waist_cm` real,
	`sleep_h` real,
	`protein_g` integer,
	`steps` integer,
	`creatine` integer,
	`water_l` real,
	`energy` integer,
	`note` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text,
	`type` text NOT NULL,
	`data` text,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `events_session` ON `events` (`session_id`);--> statement-breakpoint
CREATE INDEX `events_at` ON `events` (`at`);--> statement-breakpoint
CREATE TABLE `journal` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`text` text NOT NULL,
	`tags` text,
	`session_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `program_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`changelog` text,
	`snapshot` text NOT NULL,
	`first_seen_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`program_version_id` text NOT NULL,
	`week` integer NOT NULL,
	`day_key` text NOT NULL,
	`day_name` text NOT NULL,
	`status` text NOT NULL,
	`kind` text DEFAULT 'planned' NOT NULL,
	`date` text NOT NULL,
	`started_at` integer,
	`ended_at` integer,
	`plan` text NOT NULL,
	`readiness` text,
	`rpe` integer,
	`bodyweight` real,
	`excuse` text,
	`note` text,
	`tz` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sessions_date` ON `sessions` (`date`);--> statement-breakpoint
CREATE INDEX `sessions_status` ON `sessions` (`status`);--> statement-breakpoint
CREATE TABLE `sets` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`ex_key` text NOT NULL,
	`item_idx` integer NOT NULL,
	`set_no` integer NOT NULL,
	`kind` text DEFAULT 'N' NOT NULL,
	`weight_kg` real,
	`reps` integer,
	`seconds` integer,
	`meters` integer,
	`assist` text,
	`rir` integer,
	`target` text,
	`rest_before_s` integer,
	`done_at` integer NOT NULL,
	`note` text,
	`pain_area` text,
	`pain_level` integer,
	`swapped_from` text,
	`deleted` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sets_session` ON `sets` (`session_id`);--> statement-breakpoint
CREATE INDEX `sets_ex` ON `sets` (`ex_key`,`done_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tests` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`test_key` text NOT NULL,
	`value` real NOT NULL,
	`unit` text NOT NULL,
	`note` text,
	`created_at` integer NOT NULL
);
