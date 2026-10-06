import { sql } from "drizzle-orm"
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"
import { nanoid } from "nanoid"
import type { CsvMapping, StoredCsvMapping } from "../ingest/csv/types"
import { organization, user } from "./auth-schema"

export * from "./auth-schema"

const id = () => text("id").primaryKey().$defaultFn(() => nanoid())
const orgId = () => text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" })
const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
const json = <T>(name: string) => text(name, { mode: "json" }).$type<T>()
const bool = (name: string) => integer(name, { mode: "boolean" }).notNull().default(false)

export const CURRENCIES = ["EUR", "GBP", "USD"] as const
/** draft → finalized → paid (invoices) · accepted/declined → converted (quotes) · cancelled by a credit note. */
export const DOCUMENT_STATUSES = ["draft", "finalized", "paid", "void", "cancelled", "accepted", "declined", "converted"] as const

// ─── Workspace ────────────────────────────────────────────────────────────────

export const workspaceSettings = sqliteTable("workspace_settings", {
  orgId: text("org_id").primaryKey().references(() => organization.id, { onDelete: "cascade" }),
  jurisdiction: text("jurisdiction", { enum: ["de", "uk", "us", "je"] }),
  legalName: text("legal_name").notNull().default(""),
  addressLine1: text("address_line1").notNull().default(""),
  addressLine2: text("address_line2").notNull().default(""),
  postcode: text("postcode").notNull().default(""),
  city: text("city").notNull().default(""),
  country: text("country").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  website: text("website").notNull().default(""),
  taxNumber: text("tax_number").notNull().default(""),
  vatId: text("vat_id").notNull().default(""),
  bankIban: text("bank_iban").notNull().default(""),
  bankBic: text("bank_bic").notNull().default(""),
  ukSortCode: text("uk_sort_code").notNull().default(""),
  ukAccountNumber: text("uk_account_number").notNull().default(""),
  usRoutingNumber: text("us_routing_number").notNull().default(""),
  logoPath: text("logo_path"),
  currency: text("currency", { enum: CURRENCIES }).notNull().default("EUR"),
  locale: text("locale").notNull().default("en-GB"),
  timezone: text("timezone").notNull().default("Europe/London"),
  taxRegistered: bool("tax_registered"),
  smallBusinessExempt: bool("small_business_exempt"),
  vatFilingFrequency: text("vat_filing_frequency", { enum: ["monthly", "quarterly", "none"] }).notNull().default("quarterly"),
  vatPeriodEndMonth: integer("vat_period_end_month").notNull().default(3),
  deDauerfrist: bool("de_dauerfrist"),
  defaultTaxRateBp: integer("default_tax_rate_bp").notNull().default(0),
  defaultPaymentTermsDays: integer("default_payment_terms_days").notNull().default(14),
  invoicePrefix: text("invoice_prefix").notNull().default("INV-"),
  nextInvoiceSeq: integer("next_invoice_seq").notNull().default(1),
  quotePrefix: text("quote_prefix").notNull().default("QUO-"),
  nextQuoteSeq: integer("next_quote_seq").notNull().default(1),
  creditNotePrefix: text("credit_note_prefix").notNull().default("CN-"),
  nextCreditNoteSeq: integer("next_credit_note_seq").notNull().default(1),
  /** Payment reminders: days after the due date for each dunning level, e.g. [7, 21, 35]. */
  remindersEnabled: bool("reminders_enabled"),
  reminderDays: text("reminder_days", { mode: "json" }).$type<number[]>().notNull().default([7, 21, 35]),
  /** Late fee added from the 2nd reminder on, in basis points of the open amount (0 = none). */
  lateFeeBp: integer("late_fee_bp").notNull().default(0),
  /** VAT on issued invoices is due when invoiced (accrual / Soll) or when paid (cash / Ist). */
  vatAccounting: text("vat_accounting", { enum: ["accrual", "cash"] }).notNull().default("accrual"),
  currencyLocked: bool("currency_locked"),
  advisoryOptIn: bool("advisory_opt_in"),
  advisoryOptInAt: integer("advisory_opt_in_at", { mode: "timestamp_ms" }),
  isDemo: bool("is_demo"),
  demoExpiresAt: integer("demo_expires_at", { mode: "timestamp_ms" }),
  createdAt: createdAt(),
})

// ─── Invoicing ────────────────────────────────────────────────────────────────

export const clients = sqliteTable(
  "clients",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    email: text("email").notNull().default(""),
    addressLine1: text("address_line1").notNull().default(""),
    addressLine2: text("address_line2").notNull().default(""),
    postcode: text("postcode").notNull().default(""),
    city: text("city").notNull().default(""),
    country: text("country").notNull().default(""),
    vatId: text("vat_id").notNull().default(""),
    /** Buyer reference (Leitweg-ID for German public bodies) printed into XRechnung. */
    buyerReference: text("buyer_reference").notNull().default(""),
    language: text("language", { enum: ["de", "en"] }),
    currency: text("currency", { enum: CURRENCIES }),
    createdAt: createdAt(),
  },
  (t) => [index("clients_org_name").on(t.orgId, t.name)],
)

/** Reusable products & services for the invoice editor's autocomplete. */
export const products = sqliteTable(
  "products",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    unit: text("unit").notNull().default(""),
    unitPriceMinor: integer("unit_price_minor").notNull().default(0),
    taxRateBp: integer("tax_rate_bp"),
    archived: bool("archived"),
    usageCount: integer("usage_count").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("products_org_name").on(t.orgId, t.name)],
)

export type InvoiceSnapshot = {
  seller: Record<string, string>
  client: Record<string, string>
  jurisdiction: "de" | "uk" | "us" | "je"
  language: "de" | "en"
  currency: "EUR" | "GBP" | "USD"
  locale: string
  taxLabel: string
  exemptionNote: string | null
  logoPath: string | null
  kind?: "invoice" | "quote" | "credit_note"
  /** For a credit note: the number of the invoice it corrects. */
  relatedNumber?: string | null
  items: { description: string; quantityMilli: number; unitPriceMinor: number; taxRateBp: number; discountBp?: number; unit?: string; netMinor: number }[]
  taxGroups: { rateBp: number; netMinor: number; taxMinor: number }[]
}

export const invoices = sqliteTable(
  "invoices",
  {
    id: id(),
    orgId: orgId(),
    clientId: text("client_id").references(() => clients.id, { onDelete: "set null" }),
    /** One table, three document kinds: they share editor, PDF and numbering machinery. */
    kind: text("kind", { enum: ["invoice", "quote", "credit_note"] }).notNull().default("invoice"),
    number: text("number"),
    status: text("status", { enum: DOCUMENT_STATUSES }).notNull().default("draft"),
    issueDate: text("issue_date").notNull(),
    serviceDate: text("service_date"),
    /** Payment due date for invoices; "valid until" for quotes. */
    dueDate: text("due_date").notNull(),
    currency: text("currency", { enum: CURRENCIES }).notNull(),
    /** Units of workspace currency per 1 document currency, ×1e6; locked at finalize (1e6 when equal). */
    fxRateMicro: integer("fx_rate_micro").notNull().default(1_000_000),
    /** Credit note → the invoice it corrects; quote → the invoice it became; invoice → its cancellation note. */
    relatedId: text("related_id"),
    recurringSeriesId: text("recurring_series_id"),
    publicToken: text("public_token"),
    sentAt: integer("sent_at", { mode: "timestamp_ms" }),
    viewedAt: integer("viewed_at", { mode: "timestamp_ms" }),
    subtotalMinor: integer("subtotal_minor").notNull().default(0),
    taxMinor: integer("tax_minor").notNull().default(0),
    totalMinor: integer("total_minor").notNull().default(0),
    notes: text("notes").notNull().default(""),
    paymentTerms: text("payment_terms").notNull().default(""),
    stripePaymentLink: text("stripe_payment_link").notNull().default(""),
    snapshot: json<InvoiceSnapshot>("snapshot"),
    pdfPath: text("pdf_path"),
    finalizedAt: integer("finalized_at", { mode: "timestamp_ms" }),
    paidDate: text("paid_date"),
    voidedAt: integer("voided_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("invoices_org_number").on(t.orgId, t.number),
    uniqueIndex("invoices_public_token").on(t.publicToken),
    index("invoices_org_status_due").on(t.orgId, t.status, t.dueDate),
    index("invoices_org_issue").on(t.orgId, t.issueDate),
    index("invoices_org_kind").on(t.orgId, t.kind),
  ],
)

/** Money received against an invoice (bank match, manual entry, or online payment). */
export const invoicePayments = sqliteTable(
  "invoice_payments",
  {
    id: id(),
    orgId: orgId(),
    invoiceId: text("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    method: text("method", { enum: ["bank", "manual", "online"] }).notNull().default("manual"),
    transactionId: text("transaction_id"),
    createdAt: createdAt(),
  },
  (t) => [index("payments_invoice").on(t.invoiceId)],
)

/** Activity timeline per document: created, finalized, sent, viewed, reminder, payment, cancelled… */
export const invoiceEvents = sqliteTable(
  "invoice_events",
  {
    id: id(),
    orgId: orgId(),
    invoiceId: text("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    detail: json<Record<string, unknown>>("detail"),
    at: createdAt(),
  },
  (t) => [index("events_invoice").on(t.invoiceId, t.at)],
)

export const recurringSeries = sqliteTable(
  "recurring_series",
  {
    id: id(),
    orgId: orgId(),
    /** The draft-like invoice used as the template for every generated invoice. */
    templateInvoiceId: text("template_invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
    frequency: text("frequency", { enum: ["weekly", "monthly", "quarterly", "yearly"] }).notNull(),
    /** First issue date; the n-th invoice is anchor + n periods, so month-end dates never drift. */
    anchorDate: text("anchor_date").notNull(),
    nextIssueDate: text("next_issue_date").notNull(),
    endDate: text("end_date"),
    remaining: integer("remaining"),
    autoSend: bool("auto_send"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    generatedCount: integer("generated_count").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("recurring_org_next").on(t.orgId, t.active, t.nextIssueDate)],
)

/** Daily reference rates (ECB via Frankfurter), quoted per 1 EUR. */
export const fxRates = sqliteTable(
  "fx_rates",
  {
    date: text("date").notNull(),
    currency: text("currency").notNull(),
    ratePerEurMicro: integer("rate_per_eur_micro").notNull(),
  },
  (t) => [primaryKey({ columns: [t.date, t.currency] })],
)

export const invoiceItems = sqliteTable(
  "invoice_items",
  {
    id: id(),
    invoiceId: text("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    description: text("description").notNull().default(""),
    quantityMilli: integer("quantity_milli").notNull().default(1000),
    unitPriceMinor: integer("unit_price_minor").notNull().default(0),
    taxRateBp: integer("tax_rate_bp").notNull().default(0),
    discountBp: integer("discount_bp").notNull().default(0),
    unit: text("unit").notNull().default(""),
    netMinor: integer("net_minor").notNull().default(0),
  },
  (t) => [index("invoice_items_invoice").on(t.invoiceId, t.position)],
)

// ─── Ingestion & ledger ───────────────────────────────────────────────────────

export type Reconciliation = {
  openingMinor: number | null
  closingMinor: number | null
  computedDeltaMinor: number
  ok: boolean | null
}

export type RowIssue =
  | "unparseable_date"
  | "unparseable_amount"
  | "balance_mismatch"
  | "possible_duplicate"
  | "low_confidence"
  | "out_of_period"
  | "foreign_currency"

export const importBatches = sqliteTable(
  "import_batches",
  {
    id: id(),
    orgId: orgId(),
    source: text("source", { enum: ["csv", "pdf"] }).notNull(),
    filename: text("filename").notNull(),
    filePath: text("file_path"),
    fileSha256: text("file_sha256").notNull(),
    status: text("status", { enum: ["uploaded", "parsing", "needs_mapping", "staged", "committed", "failed"] })
      .notNull()
      .default("uploaded"),
    parser: text("parser", { enum: ["csv", "pdf_text", "pdf_vision"] }),
    modelUsed: text("model_used"),
    attempts: integer("attempts").notNull().default(0),
    llmCalled: bool("llm_called"),
    detectedCurrency: text("detected_currency"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    reconciliation: json<Reconciliation>("reconciliation"),
    csvMapping: json<StoredCsvMapping>("csv_mapping"),
    rowCount: integer("row_count").notNull().default(0),
    createdAt: createdAt(),
    committedAt: integer("committed_at", { mode: "timestamp_ms" }),
  },
  (t) => [uniqueIndex("import_batches_org_sha").on(t.orgId, t.fileSha256), index("import_batches_org_created").on(t.orgId, t.createdAt)],
)

export const importRows = sqliteTable(
  "import_rows",
  {
    id: id(),
    batchId: text("batch_id").notNull().references(() => importBatches.id, { onDelete: "cascade" }),
    rowIndex: integer("row_index").notNull(),
    date: text("date"),
    description: text("description").notNull().default(""),
    counterparty: text("counterparty").notNull().default(""),
    amountMinor: integer("amount_minor"),
    balanceMinor: integer("balance_minor"),
    raw: json<unknown>("raw"),
    issues: json<RowIssue[]>("issues").notNull().default([]),
    include: integer("include", { mode: "boolean" }).notNull().default(true),
    matchedInvoiceId: text("matched_invoice_id").references(() => invoices.id, { onDelete: "set null" }),
  },
  (t) => [index("import_rows_batch").on(t.batchId, t.rowIndex)],
)

export const ledgerAccounts = sqliteTable(
  "ledger_accounts",
  {
    id: id(),
    orgId: orgId(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    kind: text("kind", { enum: ["income", "expense", "transfer", "owner", "tax"] }).notNull(),
    taxLine: text("tax_line"),
    /** Default input-VAT rate for purchases booked here (null = no VAT, e.g. wages, insurance, bank fees). */
    inputVatBp: integer("input_vat_bp"),
    archived: bool("archived"),
  },
  (t) => [uniqueIndex("ledger_accounts_org_code").on(t.orgId, t.code)],
)

export const transactions = sqliteTable(
  "transactions",
  {
    id: id(),
    orgId: orgId(),
    batchId: text("batch_id").references(() => importBatches.id, { onDelete: "set null" }),
    date: text("date").notNull(),
    description: text("description").notNull(),
    counterparty: text("counterparty").notNull().default(""),
    amountMinor: integer("amount_minor").notNull(),
    ledgerAccountId: text("ledger_account_id").references(() => ledgerAccounts.id, { onDelete: "set null" }),
    categorizationSource: text("categorization_source", { enum: ["rule", "ai", "human", "heuristic"] }),
    aiConfidenceBp: integer("ai_confidence_bp"),
    reviewStatus: text("review_status", { enum: ["ok", "needs_review"] }).notNull().default("needs_review"),
    dedupeHash: text("dedupe_hash").notNull(),
    invoiceId: text("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
    /** Input VAT rate contained in this (gross) purchase; null = account default. */
    vatRateBp: integer("vat_rate_bp"),
    note: text("note").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("transactions_org_dedupe").on(t.orgId, t.dedupeHash),
    index("transactions_org_date").on(t.orgId, t.date),
    index("transactions_org_review").on(t.orgId, t.reviewStatus),
  ],
)

export const csvMappingProfiles = sqliteTable(
  "csv_mapping_profiles",
  {
    id: id(),
    orgId: orgId(),
    headerFingerprint: text("header_fingerprint").notNull(),
    mapping: json<CsvMapping>("mapping").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("csv_profiles_org_fp").on(t.orgId, t.headerFingerprint)],
)

// ─── Bookkeeping service ──────────────────────────────────────────────────────

export const categorizationRules = sqliteTable(
  "categorization_rules",
  {
    id: id(),
    orgId: orgId(),
    matchField: text("match_field", { enum: ["description", "counterparty"] }).notNull(),
    matchType: text("match_type", { enum: ["contains", "equals", "regex"] }).notNull(),
    pattern: text("pattern").notNull(),
    sign: text("sign", { enum: ["credit", "debit", "any"] }).notNull().default("any"),
    ledgerAccountId: text("ledger_account_id").notNull().references(() => ledgerAccounts.id, { onDelete: "cascade" }),
    priority: integer("priority").notNull().default(100),
    createdBy: text("created_by", { enum: ["user", "ai_suggested"] }).notNull().default("user"),
    approved: integer("approved", { mode: "boolean" }).notNull().default(true),
    hitCount: integer("hit_count").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("rules_org_priority").on(t.orgId, t.priority)],
)

export const serviceEngagements = sqliteTable(
  "service_engagements",
  {
    id: id(),
    orgId: orgId(),
    status: text("status", { enum: ["requested", "active", "paused", "ended"] }).notNull().default("requested"),
    assignedStaffUserId: text("assigned_staff_user_id").references(() => user.id, { onDelete: "set null" }),
    clientConsentAt: integer("client_consent_at", { mode: "timestamp_ms" }),
    planLabel: text("plan_label").notNull().default(""),
    notes: text("notes").notNull().default(""),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    endedAt: integer("ended_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [index("engagements_org_status").on(t.orgId, t.status)],
)

export type CloseChecklist = { transactions: number; needsReview: number; pendingImports: number; unreconciledImports: number }

export type CloseSummary = { headline: string; bullets: string[]; watchItems: string[] }

export const periodCloses = sqliteTable(
  "period_closes",
  {
    id: id(),
    orgId: orgId(),
    period: text("period").notNull(),
    status: text("status", { enum: ["open", "in_review", "closed"] }).notNull().default("open"),
    checklist: json<CloseChecklist>("checklist"),
    aiSummary: json<CloseSummary>("ai_summary"),
    closedBy: text("closed_by").references(() => user.id, { onDelete: "set null" }),
    closedAt: integer("closed_at", { mode: "timestamp_ms" }),
    reopenedAt: integer("reopened_at", { mode: "timestamp_ms" }),
  },
  (t) => [uniqueIndex("period_closes_org_period").on(t.orgId, t.period)],
)

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: id(),
    orgId: orgId(),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    actorRole: text("actor_role", { enum: ["owner", "staff", "system"] }).notNull(),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    diff: json<unknown>("diff"),
    at: createdAt(),
  },
  (t) => [index("audit_org_at").on(t.orgId, t.at)],
)

// ─── Advisory ─────────────────────────────────────────────────────────────────

export const advisoryAlerts = sqliteTable(
  "advisory_alerts",
  {
    id: id(),
    orgId: orgId(),
    type: text("type", { enum: ["milestone_lifetime", "milestone_month", "margin_low", "tax_deadline"] }).notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    payload: json<Record<string, unknown>>("payload").notNull(),
    status: text("status", { enum: ["active", "dismissed", "converted"] }).notNull().default("active"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("alerts_org_key").on(t.orgId, t.dedupeKey)],
)

export const advisoryRequests = sqliteTable(
  "advisory_requests",
  {
    id: id(),
    orgId: orgId(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    kind: text("kind", { enum: ["growth_plan", "bookkeeping"] }).notNull().default("growth_plan"),
    alertId: text("alert_id").references(() => advisoryAlerts.id, { onDelete: "set null" }),
    metricsSnapshot: json<Record<string, unknown>>("metrics_snapshot").notNull(),
    message: text("message").notNull().default(""),
    status: text("status", { enum: ["new", "contacted", "booked", "closed"] }).notNull().default("new"),
    createdAt: createdAt(),
  },
  (t) => [index("requests_org").on(t.orgId, t.createdAt)],
)


/** Receipts & documents. Uploaded to the inbox, then matched (by AI + amount/date) to a bank transaction. */
export const attachments = sqliteTable(
  "attachments",
  {
    id: id(),
    orgId: orgId(),
    transactionId: text("transaction_id").references(() => transactions.id, { onDelete: "set null" }),
    filePath: text("file_path").notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    /** What the AI read off the receipt (vendor, date, total, VAT). */
    extracted: json<{ vendor: string | null; date: string | null; totalMinor: number | null; vatMinor: number | null; currency: string | null }>("extracted"),
    status: text("status", { enum: ["processing", "unmatched", "suggested", "matched"] }).notNull().default("processing"),
    suggestedTransactionId: text("suggested_transaction_id"),
    createdAt: createdAt(),
  },
  (t) => [index("attachments_org_status").on(t.orgId, t.status), index("attachments_txn").on(t.transactionId)],
)
