-- Data migration (additive): put every existing session into "Month 1" so history, plan position and
-- monthly reports keep working. Only runs its INSERT when there is at least one session; nothing is deleted.
INSERT INTO `blocks` (`id`, `n`, `name`, `program_id`, `start_version`, `start_date`, `end_date`, `status`, `created_at`, `updated_at`)
SELECT 'blk-1', 1, 'Month 1', 'ppl-arnold',
  (SELECT `program_version_id` FROM `sessions` ORDER BY `date`, `created_at` LIMIT 1),
  MIN(`date`), NULL, 'active', CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
FROM `sessions` HAVING COUNT(*) > 0;
--> statement-breakpoint
UPDATE `sessions` SET `block_id` = 'blk-1' WHERE `block_id` IS NULL AND EXISTS (SELECT 1 FROM `blocks` WHERE `id` = 'blk-1');
