import { and, asc, eq, lte } from "drizzle-orm"
import type { Db } from "@/db/client"
import { clients, invoices, recurringSeries } from "@/db/schema"
import { firstStepOnOrAfter, nextRecurrence, type Frequency } from "@/invoicing/documents"
import { assertAllowed } from "@/invoicing/lifecycle"
import { DomainError } from "@/lib/action-result"
import type { IsoDate } from "@/lib/dates"
import { duplicateDocument, finalizeDocument, getInvoice, logEvent } from "./invoices"
import type { WorkspaceSettings } from "./workspace"

export type RecurringSeries = typeof recurringSeries.$inferSelect
export type SeriesState = RecurringSeries["state"]

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
  return (
    db
      .select()
      .from(recurringSeries)
      .where(and(eq(recurringSeries.orgId, orgId), eq(recurringSeries.id, id)))
      .get() ?? null
  )
}

/** The series a template belongs to. */
export function seriesForTemplate(db: Db, orgId: string, templateId: string): RecurringSeries | null {
  return (
    db
      .select()
      .from(recurringSeries)
      .where(and(eq(recurringSeries.orgId, orgId), eq(recurringSeries.templateInvoiceId, templateId)))
      .get() ?? null
  )
}

/**
 * Turns an issued invoice into a recurring series: a copy becomes the series' template (its own kind, never
 * listed or issued itself), and the first invoice is due on `startDate`. One transaction.
 */
export function createSeries(
  db: Db,
  orgId: string,
  settings: WorkspaceSettings,
  sourceInvoiceId: string,
  options: { frequency: Frequency; startDate: IsoDate; totalCount: number | null; autoSend: boolean },
  today: IsoDate
): string {
  return db.transaction(() => {
    const source = getInvoice(db, orgId, sourceInvoiceId)
    if (!source) throw new DomainError("Invoice not found")
    assertAllowed(source.invoice, today, source.paidMinor, "makeRecurring")
    const templateInvoiceId = duplicateDocument(db, orgId, settings, options.startDate, sourceInvoiceId, "recurring_template")
    return db
      .insert(recurringSeries)
      .values({
        orgId,
        templateInvoiceId,
        frequency: options.frequency,
        anchorDate: options.startDate,
        nextIssueDate: options.startDate,
        totalCount: options.totalCount,
        autoSend: options.autoSend,
      })
      .returning({ id: recurringSeries.id })
      .get().id
  })
}

/** Pause or resume. Resuming continues from today — missed periods are skipped, never back-billed in a burst. */
export function setSeriesPaused(db: Db, orgId: string, id: string, paused: boolean, today: IsoDate) {
  const series = getSeries(db, orgId, id)
  if (!series) throw new DomainError("Recurring invoice not found")
  if (series.state === "completed") throw new DomainError("This series has issued all its invoices")
  if (paused) return void db.update(recurringSeries).set({ state: "paused" }).where(eq(recurringSeries.id, id)).run()
  const step = firstStepOnOrAfter(series.anchorDate, series.frequency, series.generatedCount, today)
  db.update(recurringSeries)
    .set({ state: "active", lastError: null, nextIssueDate: nextRecurrence(series.anchorDate, series.frequency, step), generatedCount: step })
    .where(eq(recurringSeries.id, id))
    .run()
}

/** Every active series (any workspace) whose next invoice is due by `today`. */
export function dueSeries(db: Db, today: IsoDate): RecurringSeries[] {
  return db
    .select()
    .from(recurringSeries)
    .where(and(eq(recurringSeries.state, "active"), lte(recurringSeries.nextIssueDate, today)))
    .all()
}

/**
 * Issues the series' next invoice and advances the series in one transaction, so a crash can never issue the same
 * period twice. The exchange rate is fetched beforehand (async) and passed in. Returns the new invoice id.
 */
export function issueNextInSeries(db: Db, settings: WorkspaceSettings, series: RecurringSeries, fxRateMicro: number, today: IsoDate): string {
  return db.transaction(() => {
    const { orgId } = series
    const id = duplicateDocument(db, orgId, settings, series.nextIssueDate, series.templateInvoiceId, "invoice", { recurringSeriesId: series.id })
    finalizeDocument(db, orgId, id, fxRateMicro, today)
    logEvent(db, orgId, id, "generated", { seriesId: series.id })
    const generatedCount = series.generatedCount + 1
    const completed = series.totalCount !== null && generatedCount >= series.totalCount
    db.update(recurringSeries)
      .set({ generatedCount, nextIssueDate: nextRecurrence(series.anchorDate, series.frequency, generatedCount), state: completed ? "completed" : "active" })
      .where(eq(recurringSeries.id, series.id))
      .run()
    return id
  })
}

/** The template can't be issued (e.g. the client's address was removed): stop and say why, instead of retrying hourly. */
export function failSeries(db: Db, seriesId: string, error: string) {
  db.update(recurringSeries)
    .set({ state: "failed", lastError: error.slice(0, 500) })
    .where(eq(recurringSeries.id, seriesId))
    .run()
}

/** Template currency, needed to fetch the exchange rate before issuing. */
export function templateCurrency(db: Db, series: RecurringSeries) {
  return getInvoice(db, series.orgId, series.templateInvoiceId)?.invoice.currency ?? null
}
