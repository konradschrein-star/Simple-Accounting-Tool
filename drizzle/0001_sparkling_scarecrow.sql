PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`client_id` text,
	`number` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`issue_date` text NOT NULL,
	`service_date` text,
	`due_date` text NOT NULL,
	`currency` text NOT NULL,
	`subtotal_minor` integer DEFAULT 0 NOT NULL,
	`tax_minor` integer DEFAULT 0 NOT NULL,
	`total_minor` integer DEFAULT 0 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`payment_terms` text DEFAULT '' NOT NULL,
	`stripe_payment_link` text DEFAULT '' NOT NULL,
	`snapshot` text,
	`pdf_path` text,
	`finalized_at` integer,
	`paid_date` text,
	`voided_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_invoices`("id", "org_id", "client_id", "number", "status", "issue_date", "service_date", "due_date", "currency", "subtotal_minor", "tax_minor", "total_minor", "notes", "payment_terms", "stripe_payment_link", "snapshot", "pdf_path", "finalized_at", "paid_date", "voided_at", "created_at", "updated_at") SELECT "id", "org_id", "client_id", "number", "status", "issue_date", "service_date", "due_date", "currency", "subtotal_minor", "tax_minor", "total_minor", "notes", "payment_terms", "stripe_payment_link", "snapshot", "pdf_path", "finalized_at", "paid_date", "voided_at", "created_at", "updated_at" FROM `invoices`;--> statement-breakpoint
DROP TABLE `invoices`;--> statement-breakpoint
ALTER TABLE `__new_invoices` RENAME TO `invoices`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_org_number` ON `invoices` (`org_id`,`number`);--> statement-breakpoint
CREATE INDEX `invoices_org_status_due` ON `invoices` (`org_id`,`status`,`due_date`);--> statement-breakpoint
CREATE INDEX `invoices_org_issue` ON `invoices` (`org_id`,`issue_date`);