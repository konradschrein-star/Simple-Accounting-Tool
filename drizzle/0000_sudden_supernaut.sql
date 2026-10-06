CREATE TABLE `advisory_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`type` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `alerts_org_key` ON `advisory_alerts` (`org_id`,`dedupe_key`);--> statement-breakpoint
CREATE TABLE `advisory_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`user_id` text,
	`kind` text DEFAULT 'growth_plan' NOT NULL,
	`alert_id` text,
	`metrics_snapshot` text NOT NULL,
	`message` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`alert_id`) REFERENCES `advisory_alerts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `requests_org` ON `advisory_requests` (`org_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`actor_user_id` text,
	`actor_role` text NOT NULL,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text,
	`diff` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_org_at` ON `audit_log` (`org_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `categorization_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`match_field` text NOT NULL,
	`match_type` text NOT NULL,
	`pattern` text NOT NULL,
	`sign` text DEFAULT 'any' NOT NULL,
	`ledger_account_id` text NOT NULL,
	`priority` integer DEFAULT 100 NOT NULL,
	`created_by` text DEFAULT 'user' NOT NULL,
	`approved` integer DEFAULT true NOT NULL,
	`hit_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ledger_account_id`) REFERENCES `ledger_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `rules_org_priority` ON `categorization_rules` (`org_id`,`priority`);--> statement-breakpoint
CREATE TABLE `clients` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`address_line1` text DEFAULT '' NOT NULL,
	`address_line2` text DEFAULT '' NOT NULL,
	`postcode` text DEFAULT '' NOT NULL,
	`city` text DEFAULT '' NOT NULL,
	`country` text DEFAULT '' NOT NULL,
	`vat_id` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `clients_org_name` ON `clients` (`org_id`,`name`);--> statement-breakpoint
CREATE TABLE `csv_mapping_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`header_fingerprint` text NOT NULL,
	`mapping` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `csv_profiles_org_fp` ON `csv_mapping_profiles` (`org_id`,`header_fingerprint`);--> statement-breakpoint
CREATE TABLE `import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`source` text NOT NULL,
	`filename` text NOT NULL,
	`file_path` text,
	`file_sha256` text NOT NULL,
	`status` text DEFAULT 'uploaded' NOT NULL,
	`parser` text,
	`model_used` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`llm_called` integer DEFAULT false NOT NULL,
	`detected_currency` text,
	`error_code` text,
	`error_message` text,
	`reconciliation` text,
	`csv_mapping` text,
	`row_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`committed_at` integer,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_batches_org_sha` ON `import_batches` (`org_id`,`file_sha256`);--> statement-breakpoint
CREATE INDEX `import_batches_org_created` ON `import_batches` (`org_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `import_rows` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`row_index` integer NOT NULL,
	`date` text,
	`description` text DEFAULT '' NOT NULL,
	`counterparty` text DEFAULT '' NOT NULL,
	`amount_minor` integer,
	`balance_minor` integer,
	`raw` text,
	`issues` text DEFAULT '[]' NOT NULL,
	`include` integer DEFAULT true NOT NULL,
	`matched_invoice_id` text,
	FOREIGN KEY (`batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`matched_invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `import_rows_batch` ON `import_rows` (`batch_id`,`row_index`);--> statement-breakpoint
CREATE TABLE `invoice_items` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`position` integer NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`quantity_milli` integer DEFAULT 1000 NOT NULL,
	`unit_price_minor` integer DEFAULT 0 NOT NULL,
	`tax_rate_bp` integer DEFAULT 0 NOT NULL,
	`net_minor` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `invoice_items_invoice` ON `invoice_items` (`invoice_id`,`position`);--> statement-breakpoint
CREATE TABLE `invoices` (
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
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_org_number` ON `invoices` (`org_id`,`number`);--> statement-breakpoint
CREATE INDEX `invoices_org_status_due` ON `invoices` (`org_id`,`status`,`due_date`);--> statement-breakpoint
CREATE INDEX `invoices_org_issue` ON `invoices` (`org_id`,`issue_date`);--> statement-breakpoint
CREATE TABLE `ledger_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`tax_line` text,
	`archived` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_accounts_org_code` ON `ledger_accounts` (`org_id`,`code`);--> statement-breakpoint
CREATE TABLE `period_closes` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`period` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`checklist` text,
	`ai_summary` text,
	`closed_by` text,
	`closed_at` integer,
	`reopened_at` integer,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`closed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `period_closes_org_period` ON `period_closes` (`org_id`,`period`);--> statement-breakpoint
CREATE TABLE `service_engagements` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`status` text DEFAULT 'requested' NOT NULL,
	`assigned_staff_user_id` text,
	`client_consent_at` integer,
	`plan_label` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`started_at` integer,
	`ended_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assigned_staff_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `engagements_org_status` ON `service_engagements` (`org_id`,`status`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`batch_id` text,
	`date` text NOT NULL,
	`description` text NOT NULL,
	`counterparty` text DEFAULT '' NOT NULL,
	`amount_minor` integer NOT NULL,
	`ledger_account_id` text,
	`categorization_source` text,
	`ai_confidence_bp` integer,
	`review_status` text DEFAULT 'needs_review' NOT NULL,
	`dedupe_hash` text NOT NULL,
	`invoice_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`ledger_account_id`) REFERENCES `ledger_accounts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_org_dedupe` ON `transactions` (`org_id`,`dedupe_hash`);--> statement-breakpoint
CREATE INDEX `transactions_org_date` ON `transactions` (`org_id`,`date`);--> statement-breakpoint
CREATE INDEX `transactions_org_review` ON `transactions` (`org_id`,`review_status`);--> statement-breakpoint
CREATE TABLE `workspace_settings` (
	`org_id` text PRIMARY KEY NOT NULL,
	`jurisdiction` text,
	`legal_name` text DEFAULT '' NOT NULL,
	`address_line1` text DEFAULT '' NOT NULL,
	`address_line2` text DEFAULT '' NOT NULL,
	`postcode` text DEFAULT '' NOT NULL,
	`city` text DEFAULT '' NOT NULL,
	`country` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`website` text DEFAULT '' NOT NULL,
	`tax_number` text DEFAULT '' NOT NULL,
	`vat_id` text DEFAULT '' NOT NULL,
	`bank_iban` text DEFAULT '' NOT NULL,
	`bank_bic` text DEFAULT '' NOT NULL,
	`uk_sort_code` text DEFAULT '' NOT NULL,
	`uk_account_number` text DEFAULT '' NOT NULL,
	`us_routing_number` text DEFAULT '' NOT NULL,
	`logo_path` text,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`locale` text DEFAULT 'en-GB' NOT NULL,
	`timezone` text DEFAULT 'Europe/London' NOT NULL,
	`tax_registered` integer DEFAULT false NOT NULL,
	`small_business_exempt` integer DEFAULT false NOT NULL,
	`vat_filing_frequency` text DEFAULT 'quarterly' NOT NULL,
	`vat_period_end_month` integer DEFAULT 3 NOT NULL,
	`de_dauerfrist` integer DEFAULT false NOT NULL,
	`default_tax_rate_bp` integer DEFAULT 0 NOT NULL,
	`default_payment_terms_days` integer DEFAULT 14 NOT NULL,
	`invoice_prefix` text DEFAULT 'INV-' NOT NULL,
	`next_invoice_seq` integer DEFAULT 1 NOT NULL,
	`currency_locked` integer DEFAULT false NOT NULL,
	`advisory_opt_in` integer DEFAULT false NOT NULL,
	`advisory_opt_in_at` integer,
	`is_demo` integer DEFAULT false NOT NULL,
	`demo_expires_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `invitation` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`inviter_id` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inviter_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `invitation_organizationId_idx` ON `invitation` (`organization_id`);--> statement-breakpoint
CREATE INDEX `invitation_email_idx` ON `invitation` (`email`);--> statement-breakpoint
CREATE TABLE `member` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `member_organizationId_idx` ON `member` (`organization_id`);--> statement-breakpoint
CREATE INDEX `member_userId_idx` ON `member` (`user_id`);--> statement-breakpoint
CREATE TABLE `organization` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`logo` text,
	`created_at` integer NOT NULL,
	`metadata` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_slug_unique` ON `organization` (`slug`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`active_organization_id` text,
	`impersonated_by` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`role` text,
	`banned` integer DEFAULT false,
	`ban_reason` text,
	`ban_expires` integer,
	`is_anonymous` integer DEFAULT false
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);