import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"
import type { Db } from "@/db/client"
import { clients, invoiceItems, invoices, workspaceSettings } from "@/db/schema"
import {
  buildSnapshot,
  finalizeBlockers,
  formatInvoiceNumber,
  type ClientInfo,
  type DraftLine,
  type SellerInfo,
} from "@/invoicing/rules"
import type { Jurisdiction } from "@/jurisdictions"
import { addDays, type IsoDate } from "@/lib/dates"
import { computeTotals, lineNetMinor } from "@/lib/money"
import { getOrganizationName, getSettings, taxProfileOf, type WorkspaceSettings } from "./workspace"

export type Invoice = typeof invoices.$inferSelect
export type InvoiceItem = typeof invoiceItems.$inferSelect

export class InvoiceError extends Error {}

export function listInvoices(db: Db, orgId: string) {
  return db
    .select({ invoice: invoices, clientName: clients.name })
    .from(invoices)
    .leftJoin(clients, eq(clients.id, invoices.clientId))
    .where(eq(invoices.orgId, orgId))
    .orderBy(desc(invoices.issueDate), desc(invoices.createdAt))
    .all()
}

export function getInvoice(db: Db, orgId: string, id: string) {
  const invoice = db.select().from(invoices).where(and(eq(invoices.orgId, orgId), eq(invoices.id, id))).get()
  if (!invoice) return null
  const items = db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id)).orderBy(asc(invoiceItems.position)).all()
  const client = invoice.clientId ? (db.select().from(clients).where(and(eq(clients.orgId, orgId), eq(clients.id, invoice.clientId))).get() ?? null) : null
  return { invoice, items, client }
}

export function createDraft(db: Db, orgId: string, settings: WorkspaceSettings, today: IsoDate, clientId: string | null = null): string {
  return db.transaction((tx) => {
    const invoice = tx
      .insert(invoices)
      .values({
        orgId,
        clientId,
        issueDate: today,
        serviceDate: today,
        dueDate: addDays(today, settings.defaultPaymentTermsDays),
        currency: settings.currency,
        paymentTerms: `${settings.defaultPaymentTermsDays}`,
      })
      .returning({ id: invoices.id })
      .get()
    tx.insert(invoiceItems)
      .values({ invoiceId: invoice.id, position: 0, description: "", quantityMilli: 1000, unitPriceMinor: 0, taxRateBp: settings.defaultTaxRateBp })
      .run()
    return invoice.id
  })
}

export type DraftInput = {
  clientId: string | null
  issueDate: IsoDate
  serviceDate: IsoDate | null
  dueDate: IsoDate
  notes: string
  paymentTerms: string
  stripePaymentLink: string
  lines: DraftLine[]
}

export function saveDraft(db: Db, orgId: string, id: string, input: DraftInput) {
  const totals = computeTotals(input.lines)
  db.transaction((tx) => {
    const current = tx.select({ status: invoices.status }).from(invoices).where(and(eq(invoices.orgId, orgId), eq(invoices.id, id))).get()
    if (!current) throw new InvoiceError("Invoice not found")
    if (current.status !== "draft") throw new InvoiceError("Finalized invoices cannot be edited")
    if (input.clientId && !tx.select({ id: clients.id }).from(clients).where(and(eq(clients.orgId, orgId), eq(clients.id, input.clientId))).get())
      throw new InvoiceError("Unknown client")
    tx.update(invoices)
      .set({
        clientId: input.clientId,
        issueDate: input.issueDate,
        serviceDate: input.serviceDate,
        dueDate: input.dueDate,
        notes: input.notes,
        paymentTerms: input.paymentTerms,
        stripePaymentLink: input.stripePaymentLink,
        subtotalMinor: totals.subtotalMinor,
        taxMinor: totals.taxMinor,
        totalMinor: totals.totalMinor,
      })
      .where(eq(invoices.id, id))
      .run()
    tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id)).run()
    if (input.lines.length)
      tx.insert(invoiceItems)
        .values(input.lines.map((l, position) => ({ invoiceId: id, position, ...l, netMinor: lineNetMinor(l.quantityMilli, l.unitPriceMinor) })))
        .run()
  })
}

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

export function clientInfo(client: typeof clients.$inferSelect): ClientInfo {
  const { name, email, addressLine1, addressLine2, postcode, city, country, vatId } = client
  return { name, email, addressLine1, addressLine2, postcode, city, country, vatId }
}

/** Builds the full printable context for a draft or finalized invoice. */
export function previewContext(db: Db, orgId: string, jurisdiction: Jurisdiction, id: string) {
  const found = getInvoice(db, orgId, id)
  if (!found) return null
  const settings = getSettings(db, orgId)
  const profile = taxProfileOf(settings)
  const seller = sellerInfo(settings, getOrganizationName(db, orgId))
  const client = found.client ? clientInfo(found.client) : null
  const lines: DraftLine[] = found.items.map(({ description, quantityMilli, unitPriceMinor, taxRateBp }) => ({ description, quantityMilli, unitPriceMinor, taxRateBp }))
  const snapshot =
    found.invoice.snapshot ??
    buildSnapshot({
      jurisdiction,
      profile,
      seller,
      client: client ?? { name: "—", email: "", addressLine1: "", addressLine2: "", postcode: "", city: "", country: "", vatId: "" },
      lines,
      logoPath: settings.logoPath,
      currency: found.invoice.currency,
      locale: settings.locale,
    })
  const blockers = finalizeBlockers({ jurisdiction, profile, seller, client, serviceDate: found.invoice.serviceDate, lines })
  return { ...found, snapshot, blockers, settings }
}

/**
 * Finalize: validate, allocate the next gap-free number and freeze the snapshot — one synchronous transaction.
 */
export function finalizeInvoice(db: Db, orgId: string, jurisdiction: Jurisdiction, id: string): string {
  const ctx = previewContext(db, orgId, jurisdiction, id)
  if (!ctx) throw new InvoiceError("Invoice not found")
  if (ctx.invoice.status !== "draft") throw new InvoiceError("Invoice is already finalized")
  if (ctx.blockers.length) throw new InvoiceError(ctx.blockers.join(" "))
  return db.transaction((tx) => {
    const settings = tx.select().from(workspaceSettings).where(eq(workspaceSettings.orgId, orgId)).get()!
    const number = formatInvoiceNumber(settings.invoicePrefix, Number(ctx.invoice.issueDate.slice(0, 4)), settings.nextInvoiceSeq)
    tx.update(workspaceSettings)
      .set({ nextInvoiceSeq: sql`${workspaceSettings.nextInvoiceSeq} + 1`, currencyLocked: true })
      .where(eq(workspaceSettings.orgId, orgId))
      .run()
    tx.update(invoices)
      .set({ number, status: "finalized", snapshot: ctx.snapshot, finalizedAt: new Date() })
      .where(and(eq(invoices.id, id), eq(invoices.status, "draft")))
      .run()
    return number
  })
}

export function setInvoiceStatus(db: Db, orgId: string, id: string, change: { to: "paid"; paidDate: IsoDate } | { to: "finalized" } | { to: "void" }) {
  const current = db.select().from(invoices).where(and(eq(invoices.orgId, orgId), eq(invoices.id, id))).get()
  if (!current) throw new InvoiceError("Invoice not found")
  if (current.status === "draft" || current.status === "void") throw new InvoiceError(`A ${current.status} invoice cannot change status`)
  const patch =
    change.to === "paid"
      ? { status: "paid" as const, paidDate: change.paidDate }
      : change.to === "void"
        ? { status: "void" as const, voidedAt: new Date(), paidDate: null }
        : { status: "finalized" as const, paidDate: null }
  db.update(invoices).set(patch).where(eq(invoices.id, id)).run()
  return current
}

export function deleteDraft(db: Db, orgId: string, id: string) {
  const result = db.delete(invoices).where(and(eq(invoices.orgId, orgId), eq(invoices.id, id), eq(invoices.status, "draft"))).run()
  if (!result.changes) throw new InvoiceError("Only drafts can be deleted")
}

export function duplicateInvoice(db: Db, orgId: string, settings: WorkspaceSettings, today: IsoDate, id: string): string {
  const source = getInvoice(db, orgId, id)
  if (!source) throw new InvoiceError("Invoice not found")
  const copy = createDraft(db, orgId, settings, today, source.invoice.clientId)
  saveDraft(db, orgId, copy, {
    clientId: source.invoice.clientId,
    issueDate: today,
    serviceDate: today,
    dueDate: addDays(today, settings.defaultPaymentTermsDays),
    notes: source.invoice.notes,
    paymentTerms: source.invoice.paymentTerms,
    stripePaymentLink: source.invoice.stripePaymentLink,
    lines: source.items.map(({ description, quantityMilli, unitPriceMinor, taxRateBp }) => ({ description, quantityMilli, unitPriceMinor, taxRateBp })),
  })
  return copy
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
