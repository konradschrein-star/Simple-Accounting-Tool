import { and, asc, desc, eq, inArray, isNull, lt, sql, sum } from "drizzle-orm"
import { nanoid } from "nanoid"
import type { Db } from "@/db/client"
import { clients, invoiceEvents, invoiceItems, invoicePayments, invoices, transactions, workspaceSettings } from "@/db/schema"
import { formatDocumentNumber, NUMBERING, openAmount, printedKind, reversalLines, type DocumentKind, type IssuedKind } from "@/invoicing/documents"
import type { EventDetail, InvoiceEventType } from "@/invoicing/events"
import { assertAllowed } from "@/invoicing/lifecycle"
import { buildSnapshot, finalizeBlockers, type ClientInfo, type DraftLine, type InvoiceSnapshot, type SellerInfo } from "@/invoicing/rules"
import { getJurisdiction, type Jurisdiction } from "@/jurisdictions"
import { DomainError } from "@/lib/action-result"
import { addDays, type IsoDate } from "@/lib/dates"
import { computeTotals, lineNetMinor, type CurrencyCode } from "@/lib/money"
import { getOrganizationName, getSettings, taxProfileOf, type WorkspaceSettings } from "./workspace"

export type Invoice = typeof invoices.$inferSelect
export type InvoiceItem = typeof invoiceItems.$inferSelect
export type InvoicePayment = typeof invoicePayments.$inferSelect
export type Client = typeof clients.$inferSelect
/** A document that has been issued: it has a number, a frozen snapshot and a share link. */
export type IssuedDocument = Invoice & { kind: IssuedKind; number: string; publicToken: string; snapshot: InvoiceSnapshot }

export class InvoiceError extends DomainError {}

const toDraftLine = ({ description, quantityMilli, unitPriceMinor, taxRateBp, discountBp, unit }: InvoiceItem): DraftLine => ({
  description,
  quantityMilli,
  unitPriceMinor,
  taxRateBp,
  discountBp,
  unit,
})

const isIssued = (invoice: Invoice): invoice is IssuedDocument =>
  invoice.kind !== "recurring_template" && invoice.status !== "draft" && !!invoice.number && !!invoice.publicToken && !!invoice.snapshot

// ─── Reading ──────────────────────────────────────────────────────────────────

/** Amount received per document. */
export function paidAmounts(db: Db, orgId: string, ids?: string[]): Map<string, number> {
  const where = ids ? and(eq(invoicePayments.orgId, orgId), inArray(invoicePayments.invoiceId, ids)) : eq(invoicePayments.orgId, orgId)
  return new Map(
    db
      .select({ id: invoicePayments.invoiceId, paid: sum(invoicePayments.amountMinor) })
      .from(invoicePayments)
      .where(where)
      .groupBy(invoicePayments.invoiceId)
      .all()
      .map((r) => [r.id, Number(r.paid ?? 0)])
  )
}

export function listDocuments(db: Db, orgId: string, kind: IssuedKind) {
  const rows = db
    .select({ invoice: invoices, clientName: clients.name })
    .from(invoices)
    .leftJoin(clients, and(eq(clients.id, invoices.clientId), eq(clients.orgId, invoices.orgId)))
    .where(and(eq(invoices.orgId, orgId), eq(invoices.kind, kind)))
    .orderBy(desc(invoices.issueDate), desc(invoices.createdAt))
    .all()
  const paid = paidAmounts(db, orgId)
  return rows.map((r) => ({ ...r, paidMinor: paid.get(r.invoice.id) ?? 0 }))
}

export function getInvoice(db: Db, orgId: string, id: string) {
  const invoice = db
    .select()
    .from(invoices)
    .where(and(eq(invoices.orgId, orgId), eq(invoices.id, id)))
    .get()
  if (!invoice) return null
  const items = db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id)).orderBy(asc(invoiceItems.position)).all()
  const client = invoice.clientId
    ? (db
        .select()
        .from(clients)
        .where(and(eq(clients.orgId, orgId), eq(clients.id, invoice.clientId)))
        .get() ?? null)
    : null
  const payments = db.select().from(invoicePayments).where(eq(invoicePayments.invoiceId, id)).orderBy(asc(invoicePayments.date)).all()
  const events = db.select().from(invoiceEvents).where(eq(invoiceEvents.invoiceId, id)).orderBy(desc(invoiceEvents.at)).all()
  const related = invoice.relatedId
    ? (db
        .select({ id: invoices.id, number: invoices.number, kind: invoices.kind })
        .from(invoices)
        .where(and(eq(invoices.orgId, orgId), eq(invoices.id, invoice.relatedId)))
        .get() ?? null)
    : null
  return { invoice, items, client, payments, events, related, paidMinor: payments.reduce((s, p) => s + p.amountMinor, 0) }
}

function requireInvoice(db: Db, orgId: string, id: string) {
  const found = getInvoice(db, orgId, id)
  if (!found) throw new InvoiceError("Document not found")
  return found
}

export function invoiceNumbers(db: Db, orgId: string, ids: string[]): Map<string, string | null> {
  if (!ids.length) return new Map()
  return new Map(
    db
      .select({ id: invoices.id, number: invoices.number })
      .from(invoices)
      .where(and(eq(invoices.orgId, orgId), inArray(invoices.id, ids)))
      .all()
      .map((i) => [i.id, i.number])
  )
}

export function logEvent<T extends InvoiceEventType>(db: Db, orgId: string, invoiceId: string, type: T, detail: EventDetail<T>) {
  db.insert(invoiceEvents).values({ orgId, invoiceId, type, detail }).run()
}

// ─── Drafting ─────────────────────────────────────────────────────────────────

function assertClient(db: Db, orgId: string, clientId: string | null) {
  if (
    clientId &&
    !db
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.orgId, orgId), eq(clients.id, clientId)))
      .get()
  )
    throw new InvoiceError("Unknown client")
}

type DraftHeader = {
  kind: DocumentKind
  clientId: string | null
  issueDate: IsoDate
  serviceDate: IsoDate | null
  dueDate: IsoDate
  currency: CurrencyCode
  notes?: string
  paymentTerms?: string
  stripePaymentLink?: string
  relatedId?: string | null
  recurringSeriesId?: string | null
}

function writeLines(db: Db, invoiceId: string, lines: DraftLine[]) {
  db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId)).run()
  if (lines.length)
    db.insert(invoiceItems)
      .values(lines.map((l, position) => ({ invoiceId, position, ...l, netMinor: lineNetMinor(l.quantityMilli, l.unitPriceMinor, l.discountBp) })))
      .run()
}

/** Inserts a draft with its lines. */
function insertDraft(db: Db, orgId: string, header: DraftHeader, lines: DraftLine[]): string {
  assertClient(db, orgId, header.clientId)
  const { subtotalMinor, taxMinor, totalMinor } = computeTotals(lines)
  return db.transaction(() => {
    const { id } = db
      .insert(invoices)
      .values({ orgId, ...header, subtotalMinor, taxMinor, totalMinor })
      .returning({ id: invoices.id })
      .get()
    writeLines(db, id, lines)
    return id
  })
}

export function createDraft(
  db: Db,
  orgId: string,
  settings: WorkspaceSettings,
  today: IsoDate,
  options: { kind?: IssuedKind; clientId?: string | null } = {}
): string {
  const kind = options.kind ?? "invoice"
  return insertDraft(
    db,
    orgId,
    {
      kind,
      clientId: options.clientId ?? null,
      issueDate: today,
      serviceDate: kind === "quote" ? null : today,
      dueDate: addDays(today, kind === "quote" ? 30 : settings.defaultPaymentTermsDays),
      currency: settings.currency,
    },
    [{ description: "", quantityMilli: 1000, unitPriceMinor: 0, taxRateBp: settings.defaultTaxRateBp }]
  )
}

export type DraftInput = {
  clientId: string | null
  issueDate: IsoDate
  serviceDate: IsoDate | null
  dueDate: IsoDate
  currency: CurrencyCode
  notes: string
  paymentTerms: string
  stripePaymentLink: string
  lines: DraftLine[]
}

export function saveDraft(db: Db, orgId: string, id: string, input: DraftInput) {
  assertClient(db, orgId, input.clientId)
  const { subtotalMinor, taxMinor, totalMinor } = computeTotals(input.lines)
  const { lines, ...header } = input
  db.transaction(() => {
    const result = db
      .update(invoices)
      .set({ ...header, subtotalMinor, taxMinor, totalMinor })
      .where(and(eq(invoices.orgId, orgId), eq(invoices.id, id), eq(invoices.status, "draft")))
      .run()
    if (!result.changes) throw new InvoiceError("Issued documents can’t be edited")
    writeLines(db, id, lines)
  })
}

/** Deletes a draft (templates are stopped via their series instead). Returns the kind, for the redirect. */
export function deleteDraft(db: Db, orgId: string, id: string, today: IsoDate): DocumentKind {
  return db.transaction(() => {
    const { invoice, paidMinor } = requireInvoice(db, orgId, id)
    assertAllowed(invoice, today, paidMinor, "delete")
    db.delete(invoices).where(eq(invoices.id, id)).run()
    return invoice.kind
  })
}

/** A fresh draft with the same client, lines and notes, dated `today`. */
export function duplicateDocument(
  db: Db,
  orgId: string,
  settings: WorkspaceSettings,
  today: IsoDate,
  id: string,
  kind?: DocumentKind,
  extra: { relatedId?: string | null; recurringSeriesId?: string | null } = {}
): string {
  const source = requireInvoice(db, orgId, id)
  const targetKind = kind ?? source.invoice.kind
  return insertDraft(
    db,
    orgId,
    {
      kind: targetKind,
      clientId: source.invoice.clientId,
      issueDate: today,
      serviceDate: targetKind === "quote" ? null : today,
      dueDate: addDays(today, targetKind === "quote" ? 30 : settings.defaultPaymentTermsDays),
      currency: source.invoice.currency,
      notes: source.invoice.notes,
      paymentTerms: source.invoice.paymentTerms,
      stripePaymentLink: source.invoice.stripePaymentLink,
      relatedId: extra.relatedId ?? null,
      recurringSeriesId: extra.recurringSeriesId ?? null,
    },
    source.items.map(toDraftLine)
  )
}

// ─── Printing context ─────────────────────────────────────────────────────────

export function sellerInfo(settings: WorkspaceSettings, orgName: string): SellerInfo {
  return {
    name: orgName,
    legalName: settings.legalName,
    addressLine1: settings.addressLine1,
    addressLine2: settings.addressLine2,
    postcode: settings.postcode,
    city: settings.city,
    country: settings.country,
    email: settings.email,
    phone: settings.phone,
    website: settings.website,
    taxNumber: settings.taxNumber,
    vatId: settings.vatId,
    bankIban: settings.bankIban,
    bankBic: settings.bankBic,
    ukSortCode: settings.ukSortCode,
    ukAccountNumber: settings.ukAccountNumber,
    usRoutingNumber: settings.usRoutingNumber,
  }
}

function clientInfo(client: Client): ClientInfo {
  const { name, email, addressLine1, addressLine2, postcode, city, country, vatId, buyerReference } = client
  return { name, email, addressLine1, addressLine2, postcode, city, country, vatId, buyerReference }
}

const NO_CLIENT: ClientInfo = { name: "—", email: "", addressLine1: "", addressLine2: "", postcode: "", city: "", country: "", vatId: "", buyerReference: "" }

/**
 * Everything needed to print a document: the frozen snapshot of an issued one, or a live snapshot of a draft
 * (templates print as the invoice they become) plus what still blocks issuing it.
 */
export function documentContext(db: Db, orgId: string, id: string) {
  const found = getInvoice(db, orgId, id)
  if (!found) return null
  const settings = getSettings(db, orgId)
  if (!settings.jurisdiction) throw new InvoiceError("Finish onboarding first")
  const jurisdiction: Jurisdiction = getJurisdiction(settings.jurisdiction)
  if (found.invoice.snapshot) return { ...found, snapshot: found.invoice.snapshot, blockers: [] as string[], settings, jurisdiction }
  const profile = taxProfileOf(settings)
  const seller = sellerInfo(settings, getOrganizationName(db, orgId))
  const client = found.client ? clientInfo(found.client) : null
  const lines = found.items.map(toDraftLine)
  const kind = printedKind(found.invoice.kind)
  const snapshot = buildSnapshot({
    kind,
    relatedNumber: found.related?.number ?? null,
    language: found.client?.language,
    jurisdiction,
    profile,
    seller,
    client: client ?? NO_CLIENT,
    lines,
    logoPath: settings.logoPath,
    currency: found.invoice.currency,
    locale: settings.locale,
  })
  const blockers = finalizeBlockers({ kind, jurisdiction, profile, seller, client, serviceDate: found.invoice.serviceDate, lines })
  return { ...found, snapshot, blockers, settings, jurisdiction }
}

export type DocumentContext = NonNullable<ReturnType<typeof documentContext>>

// ─── Issuing & lifecycle (each use case is one transaction) ───────────────────

/**
 * Finalize: validate, allocate the next gap-free number for this kind (year of issuing, so numbers never run
 * backwards across a new year), lock the exchange rate, freeze the snapshot and mint the share token.
 */
export function finalizeDocument(db: Db, orgId: string, id: string, fxRateMicro: number, today: IsoDate): string {
  return db.transaction(() => {
    const ctx = documentContext(db, orgId, id)
    if (!ctx) throw new InvoiceError("Document not found")
    assertAllowed(ctx.invoice, today, ctx.paidMinor, "finalize")
    if (ctx.blockers.length) throw new InvoiceError(ctx.blockers.join(" "))
    const { prefix, seq } = NUMBERING[printedKind(ctx.invoice.kind)]
    const settings = db.select().from(workspaceSettings).where(eq(workspaceSettings.orgId, orgId)).get()!
    const number = formatDocumentNumber(settings[prefix], Number(today.slice(0, 4)), settings[seq])
    db.update(workspaceSettings)
      .set({ [seq]: sql`${workspaceSettings[seq]} + 1`, currencyLocked: true })
      .where(eq(workspaceSettings.orgId, orgId))
      .run()
    db.update(invoices)
      .set({ number, status: "finalized", snapshot: ctx.snapshot, finalizedAt: new Date(), fxRateMicro, publicToken: nanoid(32) })
      .where(and(eq(invoices.id, id), eq(invoices.status, "draft")))
      .run()
    logEvent(db, orgId, id, "finalized", { number })
    return number
  })
}

type NewPayment = { date: IsoDate; amountMinor: number; method: InvoicePayment["method"]; transactionId?: string | null }

/** Records money received by hand. Never more than is open, never in the future. */
export function recordPayment(db: Db, orgId: string, id: string, payment: NewPayment, today: IsoDate) {
  db.transaction(() => {
    const { invoice, paidMinor } = requireInvoice(db, orgId, id)
    assertAllowed(invoice, today, paidMinor, "pay")
    if (payment.amountMinor <= 0) throw new InvoiceError("Enter a positive amount")
    if (payment.amountMinor > openAmount(invoice.totalMinor, paidMinor)) throw new InvoiceError("That’s more than is still open on this invoice")
    if (payment.date > today) throw new InvoiceError("Payments can’t be dated in the future")
    applyInvoicePayment(db, orgId, invoice, payment)
  })
}

/**
 * The one way money lands on an invoice: payment row, event, and the flip to paid once covered.
 * Runs inside the caller's transaction (better-sqlite3 is synchronous, so `db` there is that transaction).
 */
export function applyInvoicePayment(db: Db, orgId: string, invoice: { id: string; totalMinor: number }, payment: NewPayment): { paidInFull: boolean } {
  db.insert(invoicePayments)
    .values({ orgId, invoiceId: invoice.id, ...payment, transactionId: payment.transactionId ?? null })
    .run()
  const paid = paidAmounts(db, orgId, [invoice.id]).get(invoice.id) ?? 0
  const paidInFull = paid >= invoice.totalMinor
  if (paidInFull) db.update(invoices).set({ status: "paid", paidDate: payment.date }).where(eq(invoices.id, invoice.id)).run()
  logEvent(db, orgId, invoice.id, "payment", { amountMinor: payment.amountMinor, date: payment.date, method: payment.method })
  return { paidInFull }
}

/** Removes one payment (e.g. recorded by mistake). A bank-matched one also frees its bank line for re-matching. */
export function removePayment(db: Db, orgId: string, paymentId: string, today: IsoDate) {
  db.transaction(() => {
    const payment = db
      .select()
      .from(invoicePayments)
      .where(and(eq(invoicePayments.orgId, orgId), eq(invoicePayments.id, paymentId)))
      .get()
    if (!payment) throw new InvoiceError("Payment not found")
    const { invoice, paidMinor } = requireInvoice(db, orgId, payment.invoiceId)
    assertAllowed(invoice, today, paidMinor, "removePayment")
    db.delete(invoicePayments).where(eq(invoicePayments.id, paymentId)).run()
    if (payment.transactionId)
      db.update(transactions)
        .set({ invoiceId: null })
        .where(and(eq(transactions.orgId, orgId), eq(transactions.id, payment.transactionId)))
        .run()
    if (invoice.status === "paid" && paidMinor - payment.amountMinor < invoice.totalMinor)
      db.update(invoices).set({ status: "finalized", paidDate: null }).where(eq(invoices.id, invoice.id)).run()
    logEvent(db, orgId, invoice.id, "payment_removed", { amountMinor: payment.amountMinor, date: payment.date })
  })
}

/**
 * Cancels an issued invoice the compliant way (GoBD): a finalized credit note with the reversed lines
 * (Stornorechnung) is issued and linked; the original keeps its number and is marked cancelled. All or nothing.
 */
export function cancelInvoice(db: Db, orgId: string, id: string, today: IsoDate, fxRateMicro: number): { creditNoteId: string; number: string } {
  return db.transaction(() => {
    const found = requireInvoice(db, orgId, id)
    assertAllowed(found.invoice, today, found.paidMinor, "cancel")
    const creditNoteId = insertDraft(
      db,
      orgId,
      {
        kind: "credit_note",
        clientId: found.invoice.clientId,
        issueDate: today,
        serviceDate: found.invoice.serviceDate,
        dueDate: today,
        currency: found.invoice.currency,
        notes: `Cancellation of invoice ${found.invoice.number}.`,
        relatedId: id,
      },
      reversalLines(found.items.map(toDraftLine))
    )
    const number = finalizeDocument(db, orgId, creditNoteId, fxRateMicro, today)
    db.update(invoices).set({ status: "cancelled", relatedId: creditNoteId, voidedAt: new Date() }).where(eq(invoices.id, id)).run()
    logEvent(db, orgId, id, "cancelled", { creditNote: number })
    return { creditNoteId, number }
  })
}

/** Records a quote's outcome — by the owner, or by the client from the share link while the quote is valid. */
export function setQuoteOutcome(db: Db, orgId: string, id: string, outcome: "accepted" | "declined", by: "client" | "user", today: IsoDate) {
  db.transaction(() => {
    const { invoice, paidMinor } = requireInvoice(db, orgId, id)
    assertAllowed(invoice, today, paidMinor, by === "client" ? "respond" : outcome === "accepted" ? "accept" : "decline")
    db.update(invoices).set({ status: outcome }).where(eq(invoices.id, id)).run()
    logEvent(db, orgId, id, outcome, { by })
  })
}

/** Turns a quote into an invoice draft with the same lines; the quote is marked converted and linked. */
export function convertQuote(db: Db, orgId: string, settings: WorkspaceSettings, today: IsoDate, quoteId: string): string {
  return db.transaction(() => {
    const { invoice, paidMinor } = requireInvoice(db, orgId, quoteId)
    assertAllowed(invoice, today, paidMinor, "convert")
    const invoiceId = duplicateDocument(db, orgId, settings, today, quoteId, "invoice", { relatedId: quoteId })
    db.update(invoices).set({ status: "converted", relatedId: invoiceId }).where(eq(invoices.id, quoteId)).run()
    logEvent(db, orgId, quoteId, "converted", { invoiceId })
    return invoiceId
  })
}

export function markSent(db: Db, orgId: string, id: string, detail: EventDetail<"sent">) {
  db.transaction(() => {
    db.update(invoices)
      .set({ sentAt: new Date() })
      .where(and(eq(invoices.orgId, orgId), eq(invoices.id, id)))
      .run()
    logEvent(db, orgId, id, "sent", detail)
  })
}

/** Issued documents render once; later downloads serve the stored file. */
export function setInvoicePdfPath(db: Db, orgId: string, id: string, pdfPath: string) {
  db.update(invoices)
    .set({ pdfPath })
    .where(and(eq(invoices.orgId, orgId), eq(invoices.id, id)))
    .run()
}

// ─── Dunning ──────────────────────────────────────────────────────────────────

/** Issued, unpaid invoices of one workspace that are past due, with a client to remind. */
export function overdueForReminders(db: Db, orgId: string, today: IsoDate): { invoice: IssuedDocument; client: Client; paidMinor: number }[] {
  const rows = db
    .select({ invoice: invoices, client: clients })
    .from(invoices)
    .innerJoin(clients, and(eq(clients.id, invoices.clientId), eq(clients.orgId, invoices.orgId)))
    .where(and(eq(invoices.orgId, orgId), eq(invoices.kind, "invoice"), eq(invoices.status, "finalized"), lt(invoices.dueDate, today)))
    .all()
  const paid = paidAmounts(
    db,
    orgId,
    rows.map((r) => r.invoice.id)
  )
  return rows.flatMap(({ invoice, client }) => (isIssued(invoice) && client.email ? [{ invoice, client, paidMinor: paid.get(invoice.id) ?? 0 }] : []))
}

export function recordReminder(db: Db, orgId: string, id: string, level: number, feeMinor: number) {
  db.transaction(() => {
    db.update(invoices)
      .set({ reminderLevel: level })
      .where(and(eq(invoices.orgId, orgId), eq(invoices.id, id)))
      .run()
    logEvent(db, orgId, id, "reminder", { level, feeMinor })
  })
}

// ─── Public link (no login) ───────────────────────────────────────────────────

/** Resolves a share link. Tokens are 32 random characters; only issued documents have one. */
export function findByPublicToken(db: Db, token: string): { invoice: IssuedDocument; paidMinor: number } | null {
  if (typeof token !== "string" || !/^[\w-]{32}$/.test(token)) return null
  const invoice = db.select().from(invoices).where(eq(invoices.publicToken, token)).get()
  if (!invoice || !isIssued(invoice)) return null
  return { invoice, paidMinor: paidAmounts(db, invoice.orgId, [invoice.id]).get(invoice.id) ?? 0 }
}

/** Records the first time the client opens the link. */
export function markViewed(db: Db, invoice: Invoice) {
  db.transaction(() => {
    const result = db
      .update(invoices)
      .set({ viewedAt: new Date() })
      .where(and(eq(invoices.id, invoice.id), isNull(invoices.viewedAt)))
      .run()
    if (result.changes) logEvent(db, invoice.orgId, invoice.id, "viewed", null)
  })
}
