ALTER TABLE `researches` MODIFY COLUMN `keyword` varchar(1000) NOT NULL;--> statement-breakpoint
ALTER TABLE `researches` ADD `attachments` json;