PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`transaction_id` text,
	`file_path` text NOT NULL,
	`filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`extracted` text,
	`status` text DEFAULT 'processing' NOT NULL,
	`read_status` text DEFAULT 'processing' NOT NULL,
	`suggested_transaction_id` text,
	`applied_vat_rate_bp` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`suggested_transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_attachments`("id", "org_id", "transaction_id", "file_path", "filename", "mime_type", "size_bytes", "extracted", "status", "read_status", "suggested_transaction_id", "applied_vat_rate_bp", "created_at") SELECT a."id", a."org_id", a."transaction_id", a."file_path", a."filename", a."mime_type", a."size_bytes", a."extracted", a."status", CASE a."status" WHEN 'processing' THEN 'processing' WHEN 'failed' THEN 'failed' ELSE 'read' END, (SELECT t."id" FROM `transactions` t WHERE t."id" = a."suggested_transaction_id"), (SELECT t."vat_rate_bp" FROM `transactions` t WHERE t."id" = a."transaction_id"), a."created_at" FROM `attachments` a;--> statement-breakpoint
DROP TABLE `attachments`;--> statement-breakpoint
ALTER TABLE `__new_attachments` RENAME TO `attachments`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `attachments_org_txn` ON `attachments` (`org_id`,`transaction_id`);--> statement-breakpoint
CREATE INDEX `attachments_txn` ON `attachments` (`transaction_id`);