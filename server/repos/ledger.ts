import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm"
import type { Db } from "@/db/client"
import { categorizationRules, importBatches, importRows, invoices, ledgerAccounts, periodCloses, transactions } from "@/db/schema"
import type { AccountRef, Assignment, Rule } from "@/bookkeeping/categorize"
import { dedupeHashes } from "@/ingest/dedupe"
import { monthKey } from "@/lib/dates"

export type Transaction = typeof transactions.$inferSelect

export class LedgerError extends Error {}

export function listAccounts(db: Db, orgId: string): AccountRef[] {
  return db
    .select({ id: ledgerAccounts.id, code: ledgerAccounts.code, name: ledgerAccounts.name, kind: ledgerAccounts.kind, taxLine: ledgerAccounts.taxLine })
    .from(ledgerAccounts)
    .where(and(eq(ledgerAccounts.orgId, orgId), eq(ledgerAccounts.archived, false)))
    .orderBy(asc(ledgerAccounts.code))
    .all()
}

export function listRules(db: Db, orgId: string): (Rule & { hitCount: number; createdBy: "user" | "ai_suggested" })[] {
  return db.select().from(categorizationRules).where(eq(categorizationRules.orgId, orgId)).orderBy(asc(categorizationRules.priority)).all()
}

export function closedPeriods(db: Db, orgId: string): Set<string> {
  return new Set(
    db
      .select({ period: periodCloses.period })
      .from(periodCloses)
      .where(and(eq(periodCloses.orgId, orgId), eq(periodCloses.status, "closed")))
      .all()
      .map((p) => p.period),
  )
}

function assertOpen(db: Db, orgId: string, dates: string[]) {
  const closed = closedPeriods(db, orgId)
  const locked = dates.map(monthKey).find((m) => closed.has(m))
  if (locked) throw new LedgerError(`${locked} is closed. Reopen the period to make changes.`)
}

/**
 * Books the included staged rows into the ledger in one transaction. Idempotent: the unique dedupe hash makes
 * re-commits no-ops. Accepted invoice matches mark the invoice paid on the bank date.
 */
export function commitBatch(db: Db, orgId: string, batchId: string): { inserted: number; invoicesPaid: number } {
  const batch = db.select().from(importBatches).where(and(eq(importBatches.orgId, orgId), eq(importBatches.id, batchId))).get()
  if (!batch) throw new LedgerError("Import not found")
  if (batch.status !== "staged") throw new LedgerError("This import is not ready to commit")
  const rows = db.select().from(importRows).where(eq(importRows.batchId, batchId)).orderBy(asc(importRows.rowIndex)).all()
  const valid = rows.filter((r) => r.date && r.amountMinor !== null)
  const hashes = dedupeHashes(valid.map((r) => ({ date: r.date!, amountMinor: r.amountMinor!, description: r.description })))
  const included = valid.map((r, i) => ({ row: r, hash: hashes[i] })).filter(({ row }) => row.include)
  assertOpen(db, orgId, included.map(({ row }) => row.date!))

  return db.transaction((tx) => {
    let inserted = 0
    let invoicesPaid = 0
    for (const { row, hash } of included) {
      const result = tx
        .insert(transactions)
        .values({
          orgId,
          batchId,
          date: row.date!,
          description: row.description,
          counterparty: row.counterparty,
          amountMinor: row.amountMinor!,
          dedupeHash: hash,
          invoiceId: row.matchedInvoiceId,
          reviewStatus: "needs_review",
        })
        .onConflictDoNothing()
        .run()
      inserted += result.changes
      if (row.matchedInvoiceId && result.changes) {
        invoicesPaid += tx
          .update(invoices)
          .set({ status: "paid", paidDate: row.date })
          .where(and(eq(invoices.orgId, orgId), eq(invoices.id, row.matchedInvoiceId), eq(invoices.status, "finalized")))
          .run().changes
      }
    }
    tx.update(importBatches).set({ status: "committed", committedAt: new Date() }).where(eq(importBatches.id, batchId)).run()
    return { inserted, invoicesPaid }
  })
}

export function uncategorized(db: Db, orgId: string) {
  return db
    .select({ id: transactions.id, description: transactions.description, counterparty: transactions.counterparty, amountMinor: transactions.amountMinor, invoiceId: transactions.invoiceId })
    .from(transactions)
    .where(and(eq(transactions.orgId, orgId), isNull(transactions.ledgerAccountId), eq(transactions.reviewStatus, "needs_review")))
    .all()
}

export function applyAssignments(db: Db, orgId: string, assignments: Map<string, Assignment>) {
  db.transaction((tx) => {
    for (const [id, a] of assignments) {
      tx.update(transactions)
        .set({ ledgerAccountId: a.accountId, categorizationSource: a.source, reviewStatus: "ok" })
        .where(and(eq(transactions.orgId, orgId), eq(transactions.id, id)))
        .run()
      if (a.ruleId) tx.update(categorizationRules).set({ hitCount: sql`${categorizationRules.hitCount} + 1` }).where(eq(categorizationRules.id, a.ruleId)).run()
    }
  })
}

/** AI suggestions above the threshold are accepted; below it they pre-fill the review queue. */
export function applyAiSuggestions(db: Db, orgId: string, suggestions: Map<string, { accountId: string | null; confidence: number }>, autoAccept: number) {
  db.transaction((tx) => {
    for (const [id, s] of suggestions) {
      tx.update(transactions)
        .set({
          ledgerAccountId: s.accountId,
          categorizationSource: s.accountId ? "ai" : null,
          aiConfidenceBp: Math.round(s.confidence * 10000),
          reviewStatus: s.accountId && s.confidence >= autoAccept ? "ok" : "needs_review",
        })
        .where(and(eq(transactions.orgId, orgId), eq(transactions.id, id), eq(transactions.reviewStatus, "needs_review")))
        .run()
    }
  })
}

export function humanExamples(db: Db, orgId: string) {
  return db
    .select({ description: transactions.description, counterparty: transactions.counterparty, amountMinor: transactions.amountMinor, accountCode: ledgerAccounts.code })
    .from(transactions)
    .innerJoin(ledgerAccounts, eq(ledgerAccounts.id, transactions.ledgerAccountId))
    .where(and(eq(transactions.orgId, orgId), eq(transactions.categorizationSource, "human")))
    .orderBy(desc(transactions.createdAt))
    .limit(20)
    .all()
}

/** Human decision on one or many transactions (review queue / transactions screen). */
export function setAccount(db: Db, orgId: string, ids: string[], accountId: string) {
  const owned = db.select({ id: ledgerAccounts.id }).from(ledgerAccounts).where(and(eq(ledgerAccounts.orgId, orgId), eq(ledgerAccounts.id, accountId))).get()
  if (!owned) throw new LedgerError("Unknown account")
  const rows = db.select({ date: transactions.date }).from(transactions).where(and(eq(transactions.orgId, orgId), inArray(transactions.id, ids))).all()
  assertOpen(db, orgId, rows.map((r) => r.date))
  db.update(transactions)
    .set({ ledgerAccountId: accountId, categorizationSource: "human", reviewStatus: "ok" })
    .where(and(eq(transactions.orgId, orgId), inArray(transactions.id, ids)))
    .run()
}

export function deleteTransaction(db: Db, orgId: string, id: string) {
  const row = db.select({ date: transactions.date }).from(transactions).where(and(eq(transactions.orgId, orgId), eq(transactions.id, id))).get()
  if (!row) return
  assertOpen(db, orgId, [row.date])
  db.delete(transactions).where(and(eq(transactions.orgId, orgId), eq(transactions.id, id))).run()
}

export function createRule(db: Db, orgId: string, rule: Omit<Rule, "id" | "priority" | "approved">, createdBy: "user" | "ai_suggested" = "user") {
  return db
    .insert(categorizationRules)
    .values({ orgId, ...rule, createdBy, approved: createdBy === "user", priority: 100 })
    .returning({ id: categorizationRules.id })
    .get().id
}

export function deleteRule(db: Db, orgId: string, id: string) {
  db.delete(categorizationRules).where(and(eq(categorizationRules.orgId, orgId), eq(categorizationRules.id, id))).run()
}

export function reviewQueue(db: Db, orgId: string): Transaction[] {
  return db
    .select()
    .from(transactions)
    .where(and(eq(transactions.orgId, orgId), eq(transactions.reviewStatus, "needs_review")))
    .orderBy(asc(transactions.date))
    .all()
}

export function countNeedsReview(db: Db, orgId: string): number {
  return (
    db
      .select({ n: sql<number>`count(*)` })
      .from(transactions)
      .where(and(eq(transactions.orgId, orgId), eq(transactions.reviewStatus, "needs_review")))
      .get()?.n ?? 0
  )
}

export function listTransactions(db: Db, orgId: string, filter: { month?: string; accountId?: string; q?: string }) {
  const conditions = [eq(transactions.orgId, orgId)]
  if (filter.month) conditions.push(sql`substr(${transactions.date}, 1, 7) = ${filter.month}`)
  if (filter.accountId === "none") conditions.push(isNull(transactions.ledgerAccountId))
  else if (filter.accountId) conditions.push(eq(transactions.ledgerAccountId, filter.accountId))
  if (filter.q) conditions.push(sql`(${transactions.description} like ${`%${filter.q}%`} or ${transactions.counterparty} like ${`%${filter.q}%`})`)
  return db
    .select({ txn: transactions, accountCode: ledgerAccounts.code, accountName: ledgerAccounts.name })
    .from(transactions)
    .leftJoin(ledgerAccounts, eq(ledgerAccounts.id, transactions.ledgerAccountId))
    .where(and(...conditions))
    .orderBy(desc(transactions.date), desc(transactions.createdAt))
    .limit(1000)
    .all()
}

export function transactionMonths(db: Db, orgId: string): string[] {
  return db
    .selectDistinct({ month: sql<string>`substr(${transactions.date}, 1, 7)` })
    .from(transactions)
    .where(eq(transactions.orgId, orgId))
    .orderBy(desc(sql`substr(${transactions.date}, 1, 7)`))
    .all()
    .map((r) => r.month)
}
