import { and, eq, lt } from "drizzle-orm"
import type { Db } from "@/db/client"
import { clients, invoicePayments, invoices, transactions } from "@/db/schema"
import { openAmount } from "@/invoicing/documents"
import { assertAllowed } from "@/invoicing/lifecycle"
import type { IsoDate } from "@/lib/dates"
import { InvoiceError, isIssued, logEvent, paidAmounts, requireInvoice, type Client, type InvoicePayment, type IssuedDocument } from "./invoices"

/** Money received on invoices, and reminding clients about money that is late. */

export type NewPayment = { date: IsoDate; amountMinor: number; method: InvoicePayment["method"]; transactionId?: string | null }

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
