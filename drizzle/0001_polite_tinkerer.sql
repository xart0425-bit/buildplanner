CREATE TABLE `research_plans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`researchId` int NOT NULL,
	`analysisJson` json,
	`markdownContent` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `research_plans_id` PRIMARY KEY(`id`),
	CONSTRAINT `research_plans_researchId_unique` UNIQUE(`researchId`)
);
--> statement-breakpoint
CREATE TABLE `research_sources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`researchId` int NOT NULL,
	`sourceType` enum('github','huggingface','papers','hackernews') NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`description` text,
	`score` float DEFAULT 0,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `research_sources_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `researches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`keyword` varchar(255) NOT NULL,
	`status` enum('pending','collecting','analyzing','done','error') NOT NULL DEFAULT 'pending',
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `researches_id` PRIMARY KEY(`id`)
);
