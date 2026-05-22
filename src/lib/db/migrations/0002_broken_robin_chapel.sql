CREATE TABLE `hubspot_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`hs_id` text NOT NULL,
	`email` text,
	`owner_id` text,
	`lifecycle_stage` text,
	`created_at` integer NOT NULL,
	`synced_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hubspot_contacts_ws_id_idx` ON `hubspot_contacts` (`workspace_id`,`hs_id`);--> statement-breakpoint
CREATE TABLE `hubspot_deals` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`hs_id` text NOT NULL,
	`name` text,
	`amount` text,
	`stage` text,
	`pipeline` text,
	`owner_id` text,
	`close_date` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hubspot_deals_ws_id_idx` ON `hubspot_deals` (`workspace_id`,`hs_id`);--> statement-breakpoint
CREATE TABLE `hubspot_owners` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`hs_id` text NOT NULL,
	`email` text,
	`first_name` text,
	`last_name` text,
	`synced_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hubspot_owners_ws_id_idx` ON `hubspot_owners` (`workspace_id`,`hs_id`);