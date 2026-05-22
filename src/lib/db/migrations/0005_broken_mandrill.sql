CREATE TABLE `pairing_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`slideshow_id` text NOT NULL,
	`token` text NOT NULL,
	`pin` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`used_by_user_id` text,
	`tv_session_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`slideshow_id`) REFERENCES `slideshows`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`used_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pairing_tokens_token_unique` ON `pairing_tokens` (`token`);--> statement-breakpoint
CREATE TABLE `tv_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`slideshow_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`token` text NOT NULL,
	`paired_by_user_id` text,
	`paired_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`label` text,
	FOREIGN KEY (`slideshow_id`) REFERENCES `slideshows`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`paired_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tv_sessions_token_unique` ON `tv_sessions` (`token`);