CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`ua` text,
	`created_at` integer NOT NULL,
	`last_ok_at` integer,
	`fails` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `push_user` ON `push_subscriptions` (`user_id`);