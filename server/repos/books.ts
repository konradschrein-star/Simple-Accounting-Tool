import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm"
import type { Db } from "@/db/client"
import { importBatches, importRows, invoices, periodCloses, transactions, type CloseChecklist, type CloseSummary } from "@/db/schema"
import type { PnlTransaction } from "@/bookkeeping/pnl"

export type PeriodClose = typeof periodCloses.$inferSelect

export function pnlInputs(db: Db, orgId: string): { txns: PnlTransaction[]; unlinkedPaid: { paidDate: string; totalMinor: number }[] } {
  const txns = db
    .select({ date: transactions.date, amountMinor: transactions.amountMinor, accountId: transactions.ledgerAccountId })
    .from(transactions)
    .where(eq(transactions.orgId, orgId))
    .all()
  const linked = db
    .select({ id: transactions.invoiceId })
    .from(transactions)
    .where(and(eq(transactions.orgId, orgId), sql`${transactions.invoiceId} is not null`))
    .all()
    .map((r) => r.id!)
  const paid = db
    .select({ id: invoices.id, paidDate: invoices.paidDate, totalMinor: invoices.totalMinor })
    .from(invoices)
    .where(and(eq(invoices.orgId, orgId), eq(invoices.status, "paid")))
    .all()
  const linkedSet = new Set(linked)
  return { txns, unlinkedPaid: paid.filter((p) => p.paidDate && !linkedSet.has(p.id)).map((p) => ({ paidDate: p.paidDate!, totalMinor: p.totalMinor })) }
}

export function monthChecklist(db: Db, orgId: string, month: string): CloseChecklist {
  const inMonth = sql`substr(${transactions.date}, 1, 7) = ${month}`
  const count = (where: ReturnType<typeof and>) => db.select({ n: sql<number>`count(*)` }).from(transactions).where(where).get()?.n ?? 0
  const batches = db
    .select({ id: importBatches.id, status: importBatches.status, reconciliation: importBatches.reconciliation })
    .from(importBatches)
    .where(eq(importBatches.orgId, orgId))
    .all()
  const touching = new Set(
    batches.length
      ? db
          .select({ batchId: importRows.batchId })
          .from(importRows)
          .where(and(inArray(importRows.batchId, batches.map((b) => b.id)), sql`substr(${importRows.date}, 1, 7) = ${month}`))
          .all()
          .map((r) => r.batchId)
      : [],
  )
  const relevant = batches.filter((b) => touching.has(b.id))
  return {
    transactions: count(and(eq(transactions.orgId, orgId), inMonth)),
    needsReview: count(and(eq(transactions.orgId, orgId), inMonth, eq(transactions.reviewStatus, "needs_review"))),
    pendingImports: relevant.filter((b) => b.status === "staged" || b.status === "parsing" || b.status === "needs_mapping").length,
    unreconciledImports: relevant.filter((b) => b.status === "committed" && b.reconciliation?.ok === false).length,
  }
}

export function listCloses(db: Db, orgId: string): PeriodClose[] {
  return db.select().from(periodCloses).where(eq(periodCloses.orgId, orgId)).orderBy(desc(periodCloses.period)).all()
}

export function getClose(db: Db, orgId: string, period: string): PeriodClose | null {
  return db.select().from(periodCloses).where(and(eq(periodCloses.orgId, orgId), eq(periodCloses.period, period))).get() ?? null
}

export function saveCloseDraft(db: Db, orgId: string, period: string, values: { checklist: CloseChecklist; aiSummary: CloseSummary }) {
  db.insert(periodCloses)
    .values({ orgId, period, status: "in_review", ...values })
    .onConflictDoUpdate({ target: [periodCloses.orgId, periodCloses.period], set: { ...values, status: sql`case when ${periodCloses.status} = 'closed' then 'closed' else 'in_review' end` } })
    .run()
}

export function closePeriod(db: Db, orgId: string, period: string, userId: string, checklist: CloseChecklist, summary: CloseSummary) {
  db.insert(periodCloses)
    .values({ orgId, period, status: "closed", checklist, aiSummary: summary, closedBy: userId, closedAt: new Date() })
    .onConflictDoUpdate({
      target: [periodCloses.orgId, periodCloses.period],
      set: { status: "closed", checklist, aiSummary: summary, closedBy: userId, closedAt: new Date() },
    })
    .run()
}

export function reopenPeriod(db: Db, orgId: string, period: string) {
  db.update(periodCloses)
    .set({ status: "open", reopenedAt: new Date() })
    .where(and(eq(periodCloses.orgId, orgId), eq(periodCloses.period, period)))
    .run()
}

export function uncategorizedInMonth(db: Db, orgId: string, month: string): number {
  return (
    db
      .select({ n: sql<number>`count(*)` })
      .from(transactions)
      .where(and(eq(transactions.orgId, orgId), isNull(transactions.ledgerAccountId), sql`substr(${transactions.date}, 1, 7) = ${month}`))
      .get()?.n ?? 0
  )
}
