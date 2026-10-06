-- Identifiers are now stored in canonical form (see lib/validation.ts): compact, upper case.
UPDATE `workspace_settings` SET `bank_iban` = upper(replace(`bank_iban`, ' ', '')), `bank_bic` = upper(replace(`bank_bic`, ' ', '')), `vat_id` = upper(replace(replace(replace(`vat_id`, ' ', ''), '.', ''), '-', ''));
--> statement-breakpoint
UPDATE `clients` SET `vat_id` = upper(replace(replace(replace(`vat_id`, ' ', ''), '.', ''), '-', ''));
