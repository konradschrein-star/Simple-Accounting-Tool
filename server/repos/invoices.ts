import { and, asc, desc, eq, inArray, sql, sum } from "drizzle-orm"
import { nanoid } from "nanoid"
import type { Db } from "@/db/client"
import { clients, invoiceEvents, invoiceItems, invoicePayments, invoices, workspaceSettings } from "@/db/schema"
import { formatDocumentNumber, NUMBERING, reversalLines, type DocumentKind } from "@/invoicing/documents"
import { buildSnapshot, finalizeBlockers, type ClientInfo, type DraftLine, type SellerInfo } from "@/invoicing/rules"
import type { Jurisdiction } from "@/jurisdictions"
import { DomainError } from "@/lib/action-result"
import { addDays, type IsoDate } from "@/lib/dates"
import { computeTotals, lineNetMinor, type CurrencyCode } from "@/lib/money"
import { getOrganizationName, getSettings, taxProfileOf, type WorkspaceSettings } from "./workspace"

export type Invoice = typeof invoices.$inferSelect
export type InvoiceItem = typeof invoiceItems.$inferSelect
export type InvoicePayment = typeof invoicePayments.$inferSelect

export class InvoiceError extends DomainError {}

const toDraftLine = ({ description, quantityMilli, unitPriceMinor, taxRateBp, discountBp, unit }: InvoiceItem): DraftLine => ({
  description,
  quantityMilli,
  unitPriceMinor,
  taxRateBp,
  discountBp,
  unit,
})

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
      .map((r) => [r.id, Number(r.paid ?? 0)]),
  )
}

export function listDocuments(db: Db, orgId: string, kind: DocumentKind) {
  const rows = db
    .select({ invoice: invoices, clientName: clients.name })
    .from(invoices)
    .leftJoin(clients, and(eq(clients.id, invoices.clientId), eq(clients.orgId, invoices.orgId)))
    // Recurring templates only exist to be copied; they are not documents in their own right.
    .where(and(eq(invoices.orgId, orgId), eq(invoices.kind, kind), sql`${invoices.id} not in (select template_invoice_id from recurring_series)`))
    .orderBy(desc(invoices.issueDate), desc(invoices.createdAt))
    .all()
  const paid = paidAmounts(db, orgId)
  return rows.map((r) => ({ ...r, paidMinor: paid.get(r.invoice.id) ?? 0 }))
}

export function getInvoice(db: Db, orgId: string, id: string) {
  const invoice = db.select().from(invoices).where(and(eq(invoices.orgId, orgId), eq(invoices.id, id))).get()
  if (!invoice) return null
  const items = db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id)).orderBy(asc(invoiceItems.position)).all()
  const client = invoice.clientId ? (db.select().from(clients).where(and(eq(clients.orgId, orgId), eq(clients.id, invoice.clientId))).get() ?? null) : null
  const payments = db.select().from(invoicePayments).where(eq(invoicePayments.invoiceId, id)).orderBy(asc(invoicePayments.date)).all()
  const events = db.select().from(invoiceEvents).where(eq(invoiceEvents.invoiceId, id)).orderBy(desc(invoiceEvents.at)).all()
  const related = invoice.relatedId ? (db.select({ id: invoices.id, number: invoices.number, kind: invoices.kind }).from(invoices).where(and(eq(invoices.orgId, orgId), eq(invoices.id, invoice.relatedId))).get() ?? null) : null
  return { invoice, items, client, payments, events, related, paidMinor: payments.reduce((s, p) => s + p.amountMinor, 0) }
}

export function invoiceNumbers(db: Db, orgId: string, ids: string[]): Map<string, string | null> {
  if (!ids.length) return new Map()
  return new Map(
    db
      .select({ id: invoices.id, number: invoices.number })
      .from(invoices)
      .where(and(eq(invoices.orgId, orgId), inArray(invoices.id, ids)))
      .all()
      .map((i) => [i.id, i.number]),
  )
}

export function logEvent(db: Db, orgId: string, invoiceId: string, type: string, detail?: Record<string, unknown>) {
  db.insert(invoiceEvents).values({ orgId, invoiceId, type, detail: detail ?? null }).run()
}

// ─── Drafting ─────────────────────────────────────────────────────────────────

function assertClient(db: Db, orgId: string, clientId: string | null) {
  if (clientId && !db.select({ id: clients.id }).from(clients).where(and(eq(clients.orgId, orgId), eq(clients.id, clientId))).get())
    throw new InvoiceError("Unknown client")
}

/** Inserts a draft with its lines in one transaction. */
function insertDraft(
  db: Db,
  orgId: string,
  header: { kind: DocumentKind; clientId: string | null; issueDate: IsoDate; serviceDate: IsoDate | null; dueDate: IsoDate; currency: CurrencyCode; notes?: string; paymentTerms?: string; stripePaymentLink?: string; relatedId?: string | null; recurringSeriesId?: string | null },
  lines: DraftLine[],
): string {
  assertClient(db, orgId, header.clientId)
  const totals = computeTotals(lines)
  return db.transaction((tx) => {
    const { id } = tx
      .insert(invoices)
      .values({ orgId, ...header, subtotalMinor: totals.subtotalMinor, taxMinor: totals.taxMinor, totalMinor: totals.totalMinor })
      .returning({ id: invoices.id })
      .get()
    if (lines.length) tx.insert(invoiceItems).values(lines.map((l, position) => ({ invoiceId: id, position, ...l, netMinor: lineNetMinor(l.quantityMilli, l.unitPriceMinor, l.discountBp) }))).run()
    return id
  })
}

export function createDraft(db: Db, orgId: string, settings: WorkspaceSettings, today: IsoDate, options: { kind?: DocumentKind; clientId?: string | null } = {}): string {
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
    [{ description: "", quantityMilli: 1000, unitPriceMinor: 0, taxRateBp: settings.defaultTaxRateBp }],
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
  const totals = computeTotals(input.lines)
  db.transaction((tx) => {
    const current = tx.select({ status: invoices.status }).from(invoices).where(and(eq(invoices.orgId, orgId), eq(invoices.id, id))).get()
    if (!current) throw new InvoiceError("Document not found")
    if (current.status !== "draft") throw new InvoiceError("Finalized documents cannot be edited")
    const { lines, ...header } = input
    tx.update(invoices)
      .set({ ...header, subtotalMinor: totals.subtotalMinor, taxMinor: totals.taxMinor, totalMinor: totals.totalMinor })
      .where(eq(invoices.id, id))
      .run()
    tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id)).run()
    if (lines.length) tx.insert(invoiceItems).values(lines.map((l, position) => ({ invoiceId: id, position, ...l, netMinor: lineNetMinor(l.quantityMilli, l.unitPriceMinor, l.discountBp) }))).run()
  })
}

export function deleteDraft(db: Db, orgId: string, id: string) {
  const result = db.delete(invoices).where(and(eq(invoices.orgId, orgId), eq(invoices.id, id), eq(invoices.status, "draft"))).run()
  if (!result.changes) throw new InvoiceError("Only drafts can be deleted")
}

/** A fresh draft with the same client, lines and notes (today's dates). */
export function duplicateDocument(db: Db, orgId: string, settings: WorkspaceSettings, today: IsoDate, id: string, kind?: DocumentKind, extra: { relatedId?: string | null; recurringSeriesId?: string | null } = {}): string {
  const source = getInvoice(db, orgId, id)
  if (!source) throw new InvoiceError("Document not found")
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
    source.items.map(toDraftLine),
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

function clientInfo(client: typeof clients.$inferSelect): ClientInfo {
  const { name, email, addressLine1, addressLine2, postcode, city, country, vatId } = client
  return { name, email, addressLine1, addressLine2, postcode, city, country, vatId }
}

const NO_CLIENT: ClientInfo = { name: "—", email: "", addressLine1: "", addressLine2: "", postcode: "", city: "", country: "", vatId: "" }

/** Everything needed to print a draft or finalized document, plus what blocks finalizing it. */
export function previewContext(db: Db, orgId: string, jurisdiction: Jurisdiction, id: string) {
  const found = getInvoice(db, orgId, id)
  if (!found) return null
  const settings = getSettings(db, orgId)
  const profile = taxProfileOf(settings)
  const seller = sellerInfo(settings, getOrganizationName(db, orgId))
  const client = found.client ? clientInfo(found.client) : null
  const lines = found.items.map(toDraftLine)
  const snapshot =
    found.invoice.snapshot ??
    buildSnapshot({
      kind: found.invoice.kind,
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
  const blockers = finalizeBlockers({ kind: found.invoice.kind, jurisdiction, profile, seller, client, serviceDate: found.invoice.serviceDate, lines })
  return { ...found, snapshot, blockers, settings }
}

// ─── Finalizing & lifecycle ───────────────────────────────────────────────────

/**
 * Finalize: validate, allocate the next gap-free number for this kind, lock the exchange rate,
 * freeze the snapshot and mint the public link token — one synchronous transaction.
 */
export function finalizeDocument(db: Db, orgId: string, jurisdiction: Jurisdiction, id: string, fxRateMicro: number): string {
  const ctx = previewContext(db, orgId, jurisdiction, id)
  if (!ctx) throw new InvoiceError("Document not found")
  if (ctx.invoice.status !== "draft") throw new InvoiceError("This document is already finalized")
  if (ctx.blockers.length) throw new InvoiceError(ctx.blockers.join(" "))
  const { prefix, seq } = NUMBERING[ctx.invoice.kind]
  return db.transaction((tx) => {
    const settings = tx.select().from(workspaceSettings).where(eq(workspaceSettings.orgId, orgId)).get()!
    const number = formatDocumentNumber(settings[prefix], Number(ctx.invoice.issueDate.slice(0, 4)), settings[seq])
    tx.update(workspaceSettings)
      .set({ [seq]: sql`${workspaceSettings[seq]} + 1`, currencyLocked: true })
      .where(eq(workspaceSettings.orgId, orgId))
      .run()
    tx.update(invoices)
      .set({ number, status: "finalized", snapshot: ctx.snapshot, finalizedAt: new Date(), fxRateMicro, publicToken: nanoid(32) })
      .where(and(eq(invoices.id, id), eq(invoices.status, "draft")))
      .run()
    tx.insert(invoiceEvents).values({ orgId, invoiceId: id, type: "finalized", detail: { number } }).run()
    return number
  })
}

/** Records money received; the invoice flips to paid once it is covered. */
export function recordPayment(db: Db, orgId: string, id: string, payment: { date: IsoDate; amountMinor: number; method: InvoicePayment["method"]; transactionId?: string | null }) {
  const found = getInvoice(db, orgId, id)
  if (!found || found.invoice.kind !== "invoice") throw new InvoiceError("Invoice not found")
  if (found.invoice.status !== "finalized") throw new InvoiceError("Only open invoices can receive payments")
  if (payment.amountMinor <= 0) throw new InvoiceError("Enter a positive amount")
  const paidAfter = found.paidMinor + payment.amountMinor
  db.transaction((tx) => {
    tx.insert(invoicePayments).values({ orgId, invoiceId: id, ...payment, transactionId: payment.transactionId ?? null }).run()
    if (paidAfter >= found.invoice.totalMinor) tx.update(invoices).set({ status: "paid", paidDate: payment.date }).where(eq(invoices.id, id)).run()
    tx.insert(invoiceEvents).values({ orgId, invoiceId: id, type: "payment", detail: { amountMinor: payment.amountMinor, date: payment.date, method: payment.method } }).run()
  })
}

/** Undo all payments (e.g. recorded by mistake). */
export function clearPayments(db: Db, orgId: string, id: string) {
  const found = getInvoice(db, orgId, id)
  if (!found || found.invoice.kind !== "invoice") throw new InvoiceError("Invoice not found")
  if (found.invoice.status !== "paid" && found.invoice.status !== "finalized") throw new InvoiceError("This invoice has no payments to undo")
  db.transaction((tx) => {
    tx.delete(invoicePayments).where(eq(invoicePayments.invoiceId, id)).run()
    tx.update(invoices).set({ status: "finalized", paidDate: null }).where(eq(invoices.id, id)).run()
    tx.insert(invoiceEvents).values({ orgId, invoiceId: id, type: "payments_cleared" }).run()
  })
}

/**
 * Cancels a finalized invoice the compliant way (GoBD): a finalized credit note with the reversed lines
 * (Stornorechnung) is issued and linked; the original keeps its number and is marked cancelled.
 */
export function cancelInvoice(db: Db, orgId: string, jurisdiction: Jurisdiction, id: string, today: IsoDate, fxRateMicro: number): { creditNoteId: string; number: string } {
  const found = getInvoice(db, orgId, id)
  if (!found || found.invoice.kind !== "invoice") throw new InvoiceError("Invoice not found")
  if (found.invoice.status !== "finalized" && found.invoice.status !== "paid") throw new InvoiceError("Only finalized invoices can be cancelled")
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
    reversalLines(found.items.map(toDraftLine)),
  )
  const number = finalizeDocument(db, orgId, jurisdiction, creditNoteId, fxRateMicro)
  db.transaction((tx) => {
    tx.update(invoices).set({ status: "cancelled", relatedId: creditNoteId, voidedAt: new Date() }).where(eq(invoices.id, id)).run()
    tx.insert(invoiceEvents).values({ orgId, invoiceId: id, type: "cancelled", detail: { creditNote: number } }).run()
  })
  return { creditNoteId, number }
}

export function setQuoteOutcome(db: Db, orgId: string, id: string, outcome: "accepted" | "declined") {
  const result = db
    .update(invoices)
    .set({ status: outcome })
    .where(and(eq(invoices.orgId, orgId), eq(invoices.id, id), eq(invoices.kind, "quote"), inArray(invoices.status, ["finalized", "accepted", "declined"])))
    .run()
  if (!result.changes) throw new InvoiceError("Only sent quotes can be accepted or declined")
  logEvent(db, orgId, id, outcome)
}

/** Turns a quote into an invoice draft with the same lines; the quote is marked converted and linked. */
export function convertQuote(db: Db, orgId: string, settings: WorkspaceSettings, today: IsoDate, quoteId: string): string {
  const quote = getInvoice(db, orgId, quoteId)
  if (!quote || quote.invoice.kind !== "quote") throw new InvoiceError("Quote not found")
  if (quote.invoice.status === "draft" || quote.invoice.status === "converted") throw new InvoiceError("This quote cannot be converted")
  const invoiceId = duplicateDocument(db, orgId, settings, today, quoteId, "invoice", { relatedId: quoteId })
  db.update(invoices).set({ status: "converted", relatedId: invoiceId }).where(eq(invoices.id, quoteId)).run()
  logEvent(db, orgId, quoteId, "converted", { invoiceId })
  return invoiceId
}

export function markSent(db: Db, orgId: string, id: string, detail: Record<string, unknown>) {
  db.update(invoices).set({ sentAt: new Date() }).where(and(eq(invoices.orgId, orgId), eq(invoices.id, id))).run()
  logEvent(db, orgId, id, "sent", detail)
}

/** Finalized invoices render once; later downloads serve the stored file. */
export function setInvoicePdfPath(db: Db, orgId: string, id: string, pdfPath: string) {
  db.update(invoices).set({ pdfPath }).where(and(eq(invoices.orgId, orgId), eq(invoices.id, id))).run()
}

// ─── Public link (no login) ───────────────────────────────────────────────────

/** Resolves a public link. Tokens are 32 random characters; only finalized documents have one. */
export function findByPublicToken(db: Db, token: string) {
  if (!/^[\w-]{32}$/.test(token)) return null
  const invoice = db.select().from(invoices).where(eq(invoices.publicToken, token)).get()
  if (!invoice || invoice.status === "draft") return null
  const paidMinor = paidAmounts(db, invoice.orgId, [invoice.id]).get(invoice.id) ?? 0
  return { invoice, paidMinor }
}

export function markViewed(db: Db, invoice: Invoice) {
  if (invoice.viewedAt) return
  db.update(invoices).set({ viewedAt: new Date() }).where(eq(invoices.id, invoice.id)).run()
  logEvent(db, invoice.orgId, invoice.id, "viewed")
}
