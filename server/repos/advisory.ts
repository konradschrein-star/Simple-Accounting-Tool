import { and, desc, eq, inArray } from "drizzle-orm"
import type { Db } from "@/db/client"
import { advisoryAlerts, advisoryRequests, invoices, ledgerAccounts, transactions } from "@/db/schema"
import type { MetricInvoice, MetricTransaction } from "@/advisory/metrics"
import type { TriggeredAlert } from "@/advisory/triggers"

export type AdvisoryAlert = typeof advisoryAlerts.$inferSelect

export function metricInputs(db: Db, orgId: string): { invoices: MetricInvoice[]; transactions: MetricTransaction[] } {
  return {
    invoices: db
      .select({ id: invoices.id, status: invoices.status, issueDate: invoices.issueDate, dueDate: invoices.dueDate, paidDate: invoices.paidDate, totalMinor: invoices.totalMinor })
      .from(invoices)
      .where(eq(invoices.orgId, orgId))
      .all(),
    transactions: db
      .select({ date: transactions.date, amountMinor: transactions.amountMinor, kind: ledgerAccounts.kind, invoiceId: transactions.invoiceId })
      .from(transactions)
      .leftJoin(ledgerAccounts, eq(ledgerAccounts.id, transactions.ledgerAccountId))
      .where(eq(transactions.orgId, orgId))
      .all(),
  }
}

/** Insert-or-ignore on the dedupe key: an alert fires once per period, even after dismissal. */
export function persistAlerts(db: Db, orgId: string, alerts: TriggeredAlert[]) {
  if (!alerts.length) return
  db.insert(advisoryAlerts)
    .values(alerts.map((a) => ({ orgId, type: a.type, dedupeKey: a.dedupeKey, payload: a.payload })))
    .onConflictDoNothing()
    .run()
}

/** Tax alerts whose deadline has passed are no longer actionable. */
export function expireTaxAlerts(db: Db, orgId: string, today: string) {
  const stale = db
    .select({ id: advisoryAlerts.id, payload: advisoryAlerts.payload })
    .from(advisoryAlerts)
    .where(and(eq(advisoryAlerts.orgId, orgId), eq(advisoryAlerts.type, "tax_deadline"), eq(advisoryAlerts.status, "active")))
    .all()
    .filter((a) => String(a.payload.date ?? "") < today)
    .map((a) => a.id)
  if (stale.length) db.update(advisoryAlerts).set({ status: "dismissed" }).where(inArray(advisoryAlerts.id, stale)).run()
}

export function activeAlerts(db: Db, orgId: string): AdvisoryAlert[] {
  return db
    .select()
    .from(advisoryAlerts)
    .where(and(eq(advisoryAlerts.orgId, orgId), eq(advisoryAlerts.status, "active")))
    .orderBy(desc(advisoryAlerts.createdAt))
    .all()
}

export function getAlert(db: Db, orgId: string, id: string): AdvisoryAlert | null {
  return db.select().from(advisoryAlerts).where(and(eq(advisoryAlerts.orgId, orgId), eq(advisoryAlerts.id, id))).get() ?? null
}

export function setAlertStatus(db: Db, orgId: string, id: string, status: AdvisoryAlert["status"]) {
  db.update(advisoryAlerts).set({ status }).where(and(eq(advisoryAlerts.orgId, orgId), eq(advisoryAlerts.id, id))).run()
}

export function createAdvisoryRequest(db: Db, values: typeof advisoryRequests.$inferInsert) {
  return db.insert(advisoryRequests).values(values).returning().get()
}

export function hasOpenRequest(db: Db, orgId: string, kind: "growth_plan" | "bookkeeping"): boolean {
  return !!db
    .select({ id: advisoryRequests.id })
    .from(advisoryRequests)
    .where(and(eq(advisoryRequests.orgId, orgId), eq(advisoryRequests.kind, kind), inArray(advisoryRequests.status, ["new", "contacted", "booked"])))
    .get()
}
