ALTER TABLE `researches` ADD `schedule_cron_task_uid` varchar(65);--> statement-breakpoint
ALTER TABLE `researches` ADD `refresh_interval` varchar(20) DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `researches` ADD `last_refreshed_at` timestamp;--> statement-breakpoint
ALTER TABLE `researches` ADD CONSTRAINT `researches_schedule_cron_task_uid_unique` UNIQUE(`schedule_cron_task_uid`);