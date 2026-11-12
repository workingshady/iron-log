CREATE TABLE `oauth_clients` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`redirect_uris` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer
);
--> statement-breakpoint
CREATE TABLE `oauth_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`user_id` text NOT NULL,
	`client_id` text,
	`grant_id` text,
	`scope` text,
	`code_challenge` text,
	`redirect_uri` text,
	`label` text,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`used_at` integer,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE INDEX `oauth_user` ON `oauth_tokens` (`user_id`,`kind`);--> statement-breakpoint
CREATE INDEX `oauth_grant` ON `oauth_tokens` (`grant_id`);