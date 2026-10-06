import { and, asc, eq, lte } from "drizzle-orm"
import type { Db } from "@/db/client"
import { clients, invoices, recurringSeries } from "@/db/schema"
import type { IsoDate } from "@/lib/dates"

export type RecurringSeries = typeof recurringSeries.$inferSelect
export type Frequency = RecurringSeries["frequency"]

export function listSeries(db: Db, orgId: string) {
  return db
    .select({ series: recurringSeries, template: invoices, clientName: clients.name })
    .from(recurringSeries)
    .innerJoin(invoices, eq(invoices.id, recurringSeries.templateInvoiceId))
    .leftJoin(clients, and(eq(clients.id, invoices.clientId), eq(clients.orgId, invoices.orgId)))
    .where(eq(recurringSeries.orgId, orgId))
    .orderBy(asc(recurringSeries.nextIssueDate))
    .all()
}

export function getSeries(db: Db, orgId: string, id: string): RecurringSeries | null {
  return db.select().from(recurringSeries).where(and(eq(recurringSeries.orgId, orgId), eq(recurringSeries.id, id))).get() ?? null
}

export function createSeries(db: Db, orgId: string, values: { templateInvoiceId: string; frequency: Frequency; nextIssueDate: IsoDate; endDate: IsoDate | null; remaining: number | null; autoSend: boolean }): string {
  const { id } = db.insert(recurringSeries).values({ orgId, ...values, anchorDate: values.nextIssueDate }).returning({ id: recurringSeries.id }).get()
  db.update(invoices).set({ recurringSeriesId: id }).where(and(eq(invoices.orgId, orgId), eq(invoices.id, values.templateInvoiceId))).run()
  return id
}

export function updateSeries(db: Db, orgId: string, id: string, patch: Partial<Pick<RecurringSeries, "active" | "nextIssueDate" | "autoSend" | "remaining" | "generatedCount" | "endDate">>) {
  db.update(recurringSeries).set(patch).where(and(eq(recurringSeries.orgId, orgId), eq(recurringSeries.id, id))).run()
}

/** Every active series (any workspace) whose next invoice is due by `today`. */
export function dueSeries(db: Db, today: IsoDate): RecurringSeries[] {
  return db.select().from(recurringSeries).where(and(eq(recurringSeries.active, true), lte(recurringSeries.nextIssueDate, today))).all()
}

/** The series a draft serves as template for, if any (templates are edited, never finalized). */
export function seriesForTemplate(db: Db, orgId: string, invoiceId: string): RecurringSeries | null {
  return db.select().from(recurringSeries).where(and(eq(recurringSeries.orgId, orgId), eq(recurringSeries.templateInvoiceId, invoiceId))).get() ?? null
}
