CREATE TABLE `video_projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(160) NOT NULL,
	`description` text,
	`location` varchar(180) NOT NULL,
	`mediaUrls` json NOT NULL,
	`mediaKeys` json NOT NULL,
	`mediaNames` json NOT NULL,
	`mediaTypes` json NOT NULL,
	`status` enum('Uploading','Processing','Review','Done') NOT NULL DEFAULT 'Review',
	`revisionNotes` text,
	`finalVideoUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `video_projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `video_projects_user_idx` ON `video_projects` (`userId`);