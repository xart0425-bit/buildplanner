-- `desktop_activities` predates the migration history (it was created outside of drizzle),
-- so this must not fail on databases that already have it.
CREATE TABLE IF NOT EXISTS `desktop_activities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`windowTitle` text NOT NULL,
	`processName` varchar(255) NOT NULL,
	`duration` int NOT NULL DEFAULT 0,
	`activityType` varchar(50) NOT NULL DEFAULT 'unknown',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `desktop_activities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `research_sources` MODIFY COLUMN `sourceType` enum('github','huggingface','papers','hackernews','web','review') NOT NULL;--> statement-breakpoint
ALTER TABLE `research_plans` ADD `teardownJson` json;--> statement-breakpoint
ALTER TABLE `researches` ADD `mode` enum('keyword','teardown') DEFAULT 'keyword' NOT NULL;--> statement-breakpoint
ALTER TABLE `researches` ADD `target_product` varchar(255);--> statement-breakpoint
ALTER TABLE `researches` ADD `target_url` text;