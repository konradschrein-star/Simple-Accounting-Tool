import { and, desc, eq, gte, inArray, isNull, lt, lte, notExists } from "drizzle-orm"
import type { Db } from "@/db/client"
import { attachments, transactions } from "@/db/schema"
import { impliedVatRate, suggestTransaction, type CandidateTransaction, type ReceiptData } from "@/bookkeeping/receipts"
import { DomainError } from "@/lib/action-result"
import { addDays } from "@/lib/dates"

export type Receipt = typeof attachments.$inferSelect

export class ReceiptError extends DomainError {}

export function createReceipt(db: Db, orgId: string, values: { id: string; filePath: string; filename: string; mimeType: string; sizeBytes: number }): Receipt {
  return db.insert(attachments).values({ orgId, ...values }).returning().get()
}

export function getReceipt(db: Db, orgId: string, id: string): Receipt | null {
  return db.select().from(attachments).where(and(eq(attachments.orgId, orgId), eq(attachments.id, id))).get() ?? null
}

/** Inbox first (needs a decision), then the matched archive; with the linked/suggested bank rows. */
export function listReceipts(db: Db, orgId: string, view: "inbox" | "matched") {
  const statuses: Receipt["status"][] = view === "inbox" ? ["processing", "suggested", "unmatched", "failed"] : ["matched"]
  const receipts = db
    .select()
    .from(attachments)
    .where(and(eq(attachments.orgId, orgId), inArray(attachments.status, statuses)))
    .orderBy(desc(attachments.createdAt))
    .all()
  const ids = [...new Set(receipts.flatMap((r) => [r.transactionId, r.suggestedTransactionId]).filter((v): v is string => !!v))]
  const linked = new Map(
    ids.length
      ? db
          .select({ id: transactions.id, date: transactions.date, amountMinor: transactions.amountMinor, description: transactions.description, counterparty: transactions.counterparty })
          .from(transactions)
          .where(and(eq(transactions.orgId, orgId), inArray(transactions.id, ids)))
          .all()
          .map((t) => [t.id, t])
      : [],
  )
  return receipts.map((r) => ({ receipt: r, transaction: linked.get(r.transactionId ?? "") ?? null, suggestion: linked.get(r.suggestedTransactionId ?? "") ?? null }))
}

/** Money-out bank rows that have no receipt yet — what a receipt can be linked to. */
export function unreceiptedExpenses(db: Db, orgId: string, around?: string | null): CandidateTransaction[] {
  const window = around ? and(gte(transactions.date, addDays(around, -45)), lte(transactions.date, addDays(around, 45))) : undefined
  return db
    .select({ id: transactions.id, date: transactions.date, amountMinor: transactions.amountMinor, description: transactions.description, counterparty: transactions.counterparty })
    .from(transactions)
    .where(
      and(
        eq(transactions.orgId, orgId),
        lt(transactions.amountMinor, 0),
        window,
        notExists(db.select({ id: attachments.id }).from(attachments).where(and(eq(attachments.transactionId, transactions.id), eq(attachments.status, "matched")))),
      ),
    )
    .orderBy(desc(transactions.date))
    .limit(200)
    .all()
}

/** Stores what the AI read and the best bank match, if any. */
export function recordExtraction(db: Db, orgId: string, id: string, data: ReceiptData | null) {
  const suggestion = data ? suggestTransaction(data, unreceiptedExpenses(db, orgId, data.date)) : null
  db.update(attachments)
    .set({ extracted: data, status: data ? (suggestion ? "suggested" : "unmatched") : "failed", suggestedTransactionId: suggestion?.id ?? null })
    .where(and(eq(attachments.orgId, orgId), eq(attachments.id, id), eq(attachments.status, "processing")))
    .run()
}

/**
 * Links a receipt to a bank transaction. The receipt's VAT rate (when it reads cleanly) becomes the transaction's
 * input-tax rate, so the VAT return uses the document instead of the account default.
 */
export function matchReceipt(db: Db, orgId: string, id: string, transactionId: string, ratesBp: number[]) {
  const receipt = getReceipt(db, orgId, id)
  if (!receipt) throw new ReceiptError("Receipt not found")
  const txn = db.select().from(transactions).where(and(eq(transactions.orgId, orgId), eq(transactions.id, transactionId))).get()
  if (!txn) throw new ReceiptError("Transaction not found")
  const taken = db.select({ id: attachments.id }).from(attachments).where(and(eq(attachments.transactionId, transactionId), eq(attachments.status, "matched"))).get()
  if (taken && taken.id !== id) throw new ReceiptError("That transaction already has a receipt")
  // The ratio holds in any currency, so a USD receipt paid from a EUR account still yields its rate.
  const rate = receipt.extracted ? impliedVatRate(receipt.extracted.totalMinor, receipt.extracted.vatMinor, ratesBp) : null
  db.transaction((tx) => {
    tx.update(attachments).set({ transactionId, status: "matched", suggestedTransactionId: null }).where(eq(attachments.id, id)).run()
    if (rate !== null) tx.update(transactions).set({ vatRateBp: rate }).where(eq(transactions.id, transactionId)).run()
  })
  return { vatRateBp: rate }
}

/** Back to the inbox; the transaction falls back to its account's default rate. */
export function unmatchReceipt(db: Db, orgId: string, id: string) {
  const receipt = getReceipt(db, orgId, id)
  if (!receipt?.transactionId) return
  db.transaction((tx) => {
    tx.update(transactions).set({ vatRateBp: null }).where(and(eq(transactions.orgId, orgId), eq(transactions.id, receipt.transactionId!))).run()
    tx.update(attachments).set({ transactionId: null, status: receipt.extracted ? "unmatched" : "failed" }).where(eq(attachments.id, id)).run()
  })
}

export function deleteReceipt(db: Db, orgId: string, id: string): Receipt | null {
  const receipt = getReceipt(db, orgId, id)
  if (!receipt) return null
  if (receipt.transactionId) unmatchReceipt(db, orgId, id)
  db.delete(attachments).where(and(eq(attachments.orgId, orgId), eq(attachments.id, id))).run()
  return receipt
}

/** Receipts attached per transaction (for paperclip icons in lists). */
export function receiptIdsByTransaction(db: Db, orgId: string): Map<string, string> {
  return new Map(
    db
      .select({ id: attachments.id, transactionId: attachments.transactionId })
      .from(attachments)
      .where(and(eq(attachments.orgId, orgId), eq(attachments.status, "matched")))
      .all()
      .filter((r) => r.transactionId)
      .map((r) => [r.transactionId!, r.id]),
  )
}

/** Extraction jobs live in memory: anything still "processing" after a restart gets handled by hand. */
export function recoverInterruptedReceipts(db: Db) {
  db.update(attachments).set({ status: "failed" }).where(and(eq(attachments.status, "processing"), isNull(attachments.extracted))).run()
}
