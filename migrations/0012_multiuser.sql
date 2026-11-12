CREATE TABLE `body_logs` (
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`weight_kg` real,
	`waist_cm` real,
	`sleep_h` real,
	`protein_g` integer,
	`steps` integer,
	`creatine` integer,
	`water_l` real,
	`energy` integer,
	`note` text,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `date`)
);
--> statement-breakpoint
CREATE TABLE `conversation_members` (
	`conv_id` text NOT NULL,
	`user_id` text NOT NULL,
	`joined_at` integer NOT NULL,
	`last_read_at` integer,
	`muted` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`conv_id`, `user_id`)
);
--> statement-breakpoint
CREATE INDEX `members_user` ON `conversation_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`title` text,
	`dm_key` text,
	`created_by` text NOT NULL,
	`theme` text,
	`created_at` integer NOT NULL,
	`last_message_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conv_dm` ON `conversations` (`dm_key`);--> statement-breakpoint
CREATE TABLE `custom_exercises` (
	`key` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`json` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `friendships` (
	`id` text PRIMARY KEY NOT NULL,
	`requester_id` text NOT NULL,
	`addressee_id` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`responded_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `friend_pair` ON `friendships` (`requester_id`,`addressee_id`);--> statement-breakpoint
CREATE INDEX `friend_addressee` ON `friendships` (`addressee_id`,`status`);--> statement-breakpoint
CREATE TABLE `invites` (
	`code` text PRIMARY KEY NOT NULL,
	`created_by` text NOT NULL,
	`max_uses` integer DEFAULT 1 NOT NULL,
	`uses` integer DEFAULT 0 NOT NULL,
	`expires_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`mime` text NOT NULL,
	`bytes` integer NOT NULL,
	`duration_ms` integer,
	`data` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `message_reactions` (
	`message_id` text NOT NULL,
	`user_id` text NOT NULL,
	`emoji` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`message_id`, `user_id`, `emoji`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conv_id` text NOT NULL,
	`sender_id` text NOT NULL,
	`kind` text NOT NULL,
	`text` text,
	`media_id` text,
	`sticker` text,
	`reply_to_id` text,
	`created_at` integer NOT NULL,
	`edited_at` integer,
	`deleted` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `messages_conv` ON `messages` (`conv_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`actor_id` text,
	`ref_id` text,
	`created_at` integer NOT NULL,
	`read_at` integer
);
--> statement-breakpoint
CREATE INDEX `notif_user` ON `notifications` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `post_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`user_id` text NOT NULL,
	`text` text NOT NULL,
	`created_at` integer NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `comments_post` ON `post_comments` (`post_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `post_likes` (
	`post_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`post_id`, `user_id`)
);
--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`text` text,
	`photo_ids` text,
	`session_id` text,
	`data` text,
	`visibility` text DEFAULT 'friends' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `posts_user` ON `posts` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `posts_created` ON `posts` (`created_at`);--> statement-breakpoint
CREATE TABLE `user_settings` (
	`user_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`user_id`, `key`)
);
--> statement-breakpoint
CREATE TABLE `user_programs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`template` text,
	`json` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `uprog_user` ON `user_programs` (`user_id`);--> statement-breakpoint
ALTER TABLE `blocks` ADD `user_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `cardio` ADD `user_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `cardio_user` ON `cardio` (`user_id`,`date`);--> statement-breakpoint
ALTER TABLE `events` ADD `user_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `events_user` ON `events` (`user_id`,`at`);--> statement-breakpoint
ALTER TABLE `feedback` ADD `user_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `feedback_user` ON `feedback` (`user_id`);--> statement-breakpoint
ALTER TABLE `intake` ADD `user_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `intake_user` ON `intake` (`user_id`,`item`,`date`);--> statement-breakpoint
ALTER TABLE `journal` ADD `user_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `photos` ADD `user_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `photos` ADD `visibility` text DEFAULT 'private' NOT NULL;--> statement-breakpoint
CREATE INDEX `photos_user` ON `photos` (`user_id`,`date`);--> statement-breakpoint
ALTER TABLE `sessions` ADD `user_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `sessions_user` ON `sessions` (`user_id`,`date`);--> statement-breakpoint
ALTER TABLE `sets` ADD `user_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `sets_user` ON `sets` (`user_id`,`ex_key`,`done_at`);--> statement-breakpoint
ALTER TABLE `tests` ADD `user_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `email` text;--> statement-breakpoint
ALTER TABLE `users` ADD `google_sub` text;--> statement-breakpoint
ALTER TABLE `users` ADD `role` text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `privacy` text;--> statement-breakpoint
ALTER TABLE `users` ADD `prefs` text;--> statement-breakpoint
ALTER TABLE `users` ADD `program_id` text;--> statement-breakpoint
ALTER TABLE `users` ADD `last_seen_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `users_google` ON `users` (`google_sub`);--> statement-breakpoint
-- ---- data: every existing row belongs to the first user (the owner); nothing is deleted or changed otherwise
UPDATE `users` SET `role` = 'owner' WHERE `id` = (SELECT `id` FROM `users` ORDER BY `created_at` LIMIT 1);--> statement-breakpoint
UPDATE `sessions` SET `user_id` = COALESCE((SELECT `id` FROM `users` ORDER BY `created_at` LIMIT 1), 'owner') WHERE `user_id` = '';--> statement-breakpoint
UPDATE `sets` SET `user_id` = COALESCE((SELECT `id` FROM `users` ORDER BY `created_at` LIMIT 1), 'owner') WHERE `user_id` = '';--> statement-breakpoint
UPDATE `feedback` SET `user_id` = COALESCE((SELECT `id` FROM `users` ORDER BY `created_at` LIMIT 1), 'owner') WHERE `user_id` = '';--> statement-breakpoint
UPDATE `cardio` SET `user_id` = COALESCE((SELECT `id` FROM `users` ORDER BY `created_at` LIMIT 1), 'owner') WHERE `user_id` = '';--> statement-breakpoint
UPDATE `events` SET `user_id` = COALESCE((SELECT `id` FROM `users` ORDER BY `created_at` LIMIT 1), 'owner') WHERE `user_id` = '';--> statement-breakpoint
UPDATE `tests` SET `user_id` = COALESCE((SELECT `id` FROM `users` ORDER BY `created_at` LIMIT 1), 'owner') WHERE `user_id` = '';--> statement-breakpoint
UPDATE `journal` SET `user_id` = COALESCE((SELECT `id` FROM `users` ORDER BY `created_at` LIMIT 1), 'owner') WHERE `user_id` = '';--> statement-breakpoint
UPDATE `intake` SET `user_id` = COALESCE((SELECT `id` FROM `users` ORDER BY `created_at` LIMIT 1), 'owner') WHERE `user_id` = '';--> statement-breakpoint
UPDATE `photos` SET `user_id` = COALESCE((SELECT `id` FROM `users` ORDER BY `created_at` LIMIT 1), 'owner') WHERE `user_id` = '';--> statement-breakpoint
UPDATE `blocks` SET `user_id` = COALESCE((SELECT `id` FROM `users` ORDER BY `created_at` LIMIT 1), 'owner') WHERE `user_id` = '';--> statement-breakpoint
INSERT OR IGNORE INTO `user_settings` (`user_id`, `key`, `value`) SELECT COALESCE((SELECT `id` FROM `users` ORDER BY `created_at` LIMIT 1), 'owner'), `key`, `value` FROM `settings`;--> statement-breakpoint
INSERT OR IGNORE INTO `body_logs` (`user_id`, `date`, `weight_kg`, `waist_cm`, `sleep_h`, `protein_g`, `steps`, `creatine`, `water_l`, `energy`, `note`, `updated_at`)
  SELECT COALESCE((SELECT `id` FROM `users` ORDER BY `created_at` LIMIT 1), 'owner'), `date`, `weight_kg`, `waist_cm`, `sleep_h`, `protein_g`, `steps`, `creatine`, `water_l`, `energy`, `note`, `updated_at` FROM `body`;
