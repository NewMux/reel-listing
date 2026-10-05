CREATE TABLE `auth_credentials` (
	`userId` integer PRIMARY KEY NOT NULL,
	`passwordHash` text NOT NULL,
	`salt` text NOT NULL,
	`iterations` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `auth_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` integer NOT NULL,
	`purpose` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`usedAt` integer,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `auth_tokens_user_idx` ON `auth_tokens` (`userId`);--> statement-breakpoint
CREATE TABLE `contact_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`message` text NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` integer NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`userId`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text,
	`email` text NOT NULL,
	`emailVerifiedAt` integer,
	`role` text DEFAULT 'user' NOT NULL,
	`videosRemaining` integer DEFAULT 3 NOT NULL,
	`stagingCreditsRemaining` integer DEFAULT 0 NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`lastSignedIn` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `video_projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`location` text NOT NULL,
	`mediaUrls` text NOT NULL,
	`mediaKeys` text NOT NULL,
	`mediaNames` text NOT NULL,
	`mediaTypes` text NOT NULL,
	`status` text DEFAULT 'Review' NOT NULL,
	`revisionNotes` text,
	`finalVideoUrl` text,
	`promptRequestIds` text,
	`generatedPrompts` text,
	`shotAnalysis` text,
	`customCameraMoves` text,
	`clipDurations` text,
	`falRequestIds` text,
	`clipUrls` text,
	`renderProgress` integer DEFAULT 0 NOT NULL,
	`renderPhase` text DEFAULT 'idle' NOT NULL,
	`renderError` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `video_projects_user_idx` ON `video_projects` (`userId`);