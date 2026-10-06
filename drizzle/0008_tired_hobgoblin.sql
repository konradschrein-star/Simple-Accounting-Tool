DROP INDEX `recurring_org_next`;--> statement-breakpoint
CREATE INDEX `recurring_state_next` ON `recurring_series` (`state`,`next_issue_date`);--> statement-breakpoint
ALTER TABLE `recurring_series` DROP COLUMN `end_date`;--> statement-breakpoint
ALTER TABLE `recurring_series` DROP COLUMN `remaining`;--> statement-breakpoint
ALTER TABLE `recurring_series` DROP COLUMN `active`;