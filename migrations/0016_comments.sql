CREATE TABLE `comment_likes` (
	`comment_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`comment_id`, `user_id`)
);
--> statement-breakpoint
ALTER TABLE `post_comments` ADD `parent_id` text;--> statement-breakpoint
CREATE INDEX `comments_parent` ON `post_comments` (`parent_id`);