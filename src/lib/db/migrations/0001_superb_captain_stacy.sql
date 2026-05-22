CREATE TABLE `integrations` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`provider` text NOT NULL,
	`access_token_enc` text NOT NULL,
	`refresh_token_enc` text,
	`config` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`last_synced_at` integer,
	`last_error` text,
	`record_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `integrations_ws_provider_idx` ON `integrations` (`workspace_id`,`provider`);--> statement-breakpoint
CREATE TABLE `stripe_charges` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`stripe_id` text NOT NULL,
	`customer_id` text,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`status` text NOT NULL,
	`paid` integer NOT NULL,
	`refunded` integer NOT NULL,
	`description` text,
	`occurred_at` integer NOT NULL,
	`synced_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stripe_charges_ws_id_idx` ON `stripe_charges` (`workspace_id`,`stripe_id`);