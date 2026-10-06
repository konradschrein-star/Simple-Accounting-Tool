CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`transaction_id` text,
	`file_path` text NOT NULL,
	`filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`extracted` text,
	`status` text DEFAULT 'processing' NOT NULL,
	`suggested_transaction_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `attachments_org_status` ON `attachments` (`org_id`,`status`);--> statement-breakpoint
CREATE INDEX `attachments_txn` ON `attachments` (`transaction_id`);--> statement-breakpoint
CREATE TABLE `fx_rates` (
	`date` text NOT NULL,
	`currency` text NOT NULL,
	`rate_per_eur_micro` integer NOT NULL,
	PRIMARY KEY(`date`, `currency`)
);
--> statement-breakpoint
CREATE TABLE `invoice_events` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`type` text NOT NULL,
	`detail` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `events_invoice` ON `invoice_events` (`invoice_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `invoice_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`date` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`method` text DEFAULT 'manual' NOT NULL,
	`transaction_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `payments_invoice` ON `invoice_payments` (`invoice_id`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`unit` text DEFAULT '' NOT NULL,
	`unit_price_minor` integer DEFAULT 0 NOT NULL,
	`tax_rate_bp` integer,
	`archived` integer DEFAULT false NOT NULL,
	`usage_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `products_org_name` ON `products` (`org_id`,`name`);--> statement-breakpoint
CREATE TABLE `recurring_series` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`template_invoice_id` text NOT NULL,
	`frequency` text NOT NULL,
	`anchor_date` text NOT NULL,
	`next_issue_date` text NOT NULL,
	`end_date` text,
	`remaining` integer,
	`auto_send` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`generated_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recurring_org_next` ON `recurring_series` (`org_id`,`active`,`next_issue_date`);--> statement-breakpoint
ALTER TABLE `clients` ADD `buyer_reference` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` ADD `language` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `currency` text;--> statement-breakpoint
ALTER TABLE `invoice_items` ADD `discount_bp` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `invoice_items` ADD `unit` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `kind` text DEFAULT 'invoice' NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `fx_rate_micro` integer DEFAULT 1000000 NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `related_id` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `recurring_series_id` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `public_token` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `sent_at` integer;--> statement-breakpoint
ALTER TABLE `invoices` ADD `viewed_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_public_token` ON `invoices` (`public_token`);--> statement-breakpoint
CREATE INDEX `invoices_org_kind` ON `invoices` (`org_id`,`kind`);--> statement-breakpoint
ALTER TABLE `ledger_accounts` ADD `input_vat_bp` integer;--> statement-breakpoint
ALTER TABLE `transactions` ADD `vat_rate_bp` integer;--> statement-breakpoint
ALTER TABLE `transactions` ADD `note` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `workspace_settings` ADD `quote_prefix` text DEFAULT 'QUO-' NOT NULL;--> statement-breakpoint
ALTER TABLE `workspace_settings` ADD `next_quote_seq` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `workspace_settings` ADD `credit_note_prefix` text DEFAULT 'CN-' NOT NULL;--> statement-breakpoint
ALTER TABLE `workspace_settings` ADD `next_credit_note_seq` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `workspace_settings` ADD `reminders_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `workspace_settings` ADD `reminder_days` text DEFAULT '[7,21,35]' NOT NULL;--> statement-breakpoint
ALTER TABLE `workspace_settings` ADD `late_fee_bp` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `workspace_settings` ADD `vat_accounting` text DEFAULT 'accrual' NOT NULL;--> statement-breakpoint
-- Backfill: invoices paid before payments existed get one payment covering them, linked to the bank row when matched.
INSERT INTO `invoice_payments` (`id`, `org_id`, `invoice_id`, `date`, `amount_minor`, `method`, `transaction_id`)
SELECT lower(hex(randomblob(10))), i.`org_id`, i.`id`, coalesce(i.`paid_date`, i.`issue_date`), i.`total_minor`,
  CASE WHEN t.`id` IS NULL THEN 'manual' ELSE 'bank' END, t.`id`
FROM `invoices` i
LEFT JOIN `transactions` t ON t.`id` = (SELECT t2.`id` FROM `transactions` t2 WHERE t2.`invoice_id` = i.`id` AND t2.`org_id` = i.`org_id` LIMIT 1)
WHERE i.`status` = 'paid';--> statement-breakpoint
-- Every finalized document gets a share link token.
UPDATE `invoices` SET `public_token` = lower(hex(randomblob(16))) WHERE `status` <> 'draft' AND `public_token` IS NULL;
