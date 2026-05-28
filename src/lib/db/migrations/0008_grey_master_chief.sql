ALTER TABLE `integrations` ADD `sync_status` text DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE `integrations` ADD `sync_state` text;