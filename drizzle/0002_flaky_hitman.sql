ALTER TABLE `video_projects` ADD `falRequestIds` json DEFAULT ('[]');--> statement-breakpoint
ALTER TABLE `video_projects` ADD `clipUrls` json DEFAULT ('[]');--> statement-breakpoint
ALTER TABLE `video_projects` ADD `renderProgress` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `video_projects` ADD `renderPhase` enum('idle','generating','assembly','complete','failed') DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE `video_projects` ADD `renderError` text;