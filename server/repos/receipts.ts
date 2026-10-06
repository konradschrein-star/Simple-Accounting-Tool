import { and, desc, eq, gte, isNotNull, isNull, lt, lte, notExists } from "drizzle-orm"
import type { Db } from "@/db/client"
import { attachments, transactions } from "@/db/schema"
import { impliedVatRate, suggestTransaction, type CandidateTransaction, type ReceiptData, type ReceiptMimeType } from "@/bookkeeping/receipts"
import type { Jurisdiction } from "@/jurisdictions"
import { DomainError } from "@/lib/action-result"
import { addDays } from "@/lib/dates"
import { isPeriodOpen } from "./ledger"
import { hasReceipt } from "./receipt-link"

/**
 * Receipts store one state — whether they have been read (`readStatus`). Whether a receipt is attached or has a
 * proposed match is never stored separately: it *is* `transactionId` / `suggestedTransactionId`, so the two cannot
 * disagree. A receipt remembers the VAT rate it wrote (`appliedVatRateBp`) so detaching undoes exactly that.
 */
export type Receipt = typeof attachments.$inferSelect

export class ReceiptError extends DomainError {
  constructor(
    message: string,
    readonly status: 404 | 409 = 404
  ) {
    super(message)
  }
}

const BANK_ROW = {
  id: transactions.id,
  date: transactions.date,
  amountMinor: transactions.amountMinor,
  description: transactions.description,
  counterparty: transactions.counterparty,
}

function bankRow(db: Db, orgId: string, id: string | null): CandidateTransaction | null {
  if (!id) return null
  return (
    db
      .select(BANK_ROW)
      .from(transactions)
      .where(and(eq(transactions.orgId, orgId), eq(transactions.id, id)))
      .get() ?? null
  )
}

/** A transaction of this workspace that has no receipt yet, or a domain error. */
function attachableTransaction(db: Db, orgId: string, transactionId: string): CandidateTransaction {
  const txn = bankRow(db, orgId, transactionId)
  if (!txn) throw new ReceiptError("Transaction not found")
  if (db.select({ id: attachments.id }).from(attachments).where(eq(attachments.transactionId, transactionId)).get())
    throw new ReceiptError("That transaction already has a receipt", 409)
  return txn
}

export function createReceipt(
  db: Db,
  orgId: string,
  values: { id: string; filePath: string; filename: string; mimeType: ReceiptMimeType; sizeBytes: number; transactionId?: string | null }
): Receipt {
  return db.transaction(() => {
    if (values.transactionId) attachableTransaction(db, orgId, values.transactionId)
    return db
      .insert(attachments)
      .values({ orgId, ...values })
      .returning()
      .get()
  })
}

export function getReceipt(db: Db, orgId: string, id: string): Receipt | null {
  return (
    db
      .select()
      .from(attachments)
      .where(and(eq(attachments.orgId, orgId), eq(attachments.id, id)))
      .get() ?? null
  )
}

/** What the receipts screen shows: the receipt (no storage details) and the bank row it is attached or proposed to. */
export type ReceiptListItem = Pick<Receipt, "id" | "filename" | "mimeType" | "readStatus" | "extracted"> & {
  match: "attached" | "suggested" | "open"
  transaction: CandidateTransaction | null
}

/** Inbox = not attached yet; archive = attached. */
export function listReceipts(db: Db, orgId: string, view: "inbox" | "matched"): ReceiptListItem[] {
  return db
    .select()
    .from(attachments)
    .where(and(eq(attachments.orgId, orgId), view === "inbox" ? isNull(attachments.transactionId) : isNotNull(attachments.transactionId)))
    .orderBy(desc(attachments.createdAt))
    .all()
    .map((r) => ({
      id: r.id,
      filename: r.filename,
      mimeType: r.mimeType,
      readStatus: r.readStatus,
      extracted: r.extracted,
      match: r.transactionId ? "attached" : r.suggestedTransactionId ? "suggested" : "open",
      transaction: bankRow(db, orgId, r.transactionId ?? r.suggestedTransactionId),
    }))
}

/** Money-out bank rows without a receipt — what a receipt can be attached to. */
export function unreceiptedExpenses(db: Db, orgId: string, around?: string | null): CandidateTransaction[] {
  const window = around ? and(gte(transactions.date, addDays(around, -45)), lte(transactions.date, addDays(around, 45))) : undefined
  return db
    .select(BANK_ROW)
    .from(transactions)
    .where(and(eq(transactions.orgId, orgId), lt(transactions.amountMinor, 0), window, notExists(hasReceipt(db, transactions.id))))
    .orderBy(desc(transactions.date))
    .limit(200)
    .all()
}

/**
 * Writes the receipt's VAT rate onto its transaction when the receipt states one cleanly and the month is open.
 * Closed months keep their figures; the receipt is still attached as evidence. Runs inside the caller's transaction.
 */
function applyRate(db: Db, orgId: string, receipt: Pick<Receipt, "id" | "extracted">, txn: { id: string; date: string }, jurisdiction: Jurisdiction) {
  const rate = receipt.extracted ? impliedVatRate(receipt.extracted.totalMinor, receipt.extracted.vatMinor, jurisdiction.taxRatesBp) : null
  const applied = rate !== null && isPeriodOpen(db, orgId, txn.date) ? rate : null
  if (applied !== null) db.update(transactions).set({ vatRateBp: applied }).where(eq(transactions.id, txn.id)).run()
  db.update(attachments).set({ appliedVatRateBp: applied }).where(eq(attachments.id, receipt.id)).run()
  return applied
}

/** Undoes only what the receipt itself wrote: a rate the user set since is theirs. Runs inside the caller's transaction. */
function revertRate(db: Db, orgId: string, receipt: Receipt) {
  const txn = bankRow(db, orgId, receipt.transactionId)
  if (receipt.appliedVatRateBp === null || !txn || !isPeriodOpen(db, orgId, txn.date)) return
  db.update(transactions)
    .set({ vatRateBp: null })
    .where(and(eq(transactions.id, txn.id), eq(transactions.vatRateBp, receipt.appliedVatRateBp)))
    .run()
}

/** Stores what was read. Attached receipts take their VAT rate now; unattached ones get a proposed bank match. */
export function recordExtraction(db: Db, orgId: string, id: string, data: ReceiptData | null, jurisdiction: Jurisdiction) {
  db.transaction(() => {
    const receipt = getReceipt(db, orgId, id)
    if (!receipt || receipt.readStatus !== "processing") return
    const txn = bankRow(db, orgId, receipt.transactionId)
    const suggestion = !txn && data ? suggestTransaction(data, unreceiptedExpenses(db, orgId, data.date)) : null
    db.update(attachments)
      .set({ extracted: data, readStatus: data ? "read" : "failed", suggestedTransactionId: suggestion?.id ?? null })
      .where(eq(attachments.id, id))
      .run()
    if (txn && data) applyRate(db, orgId, { id, extracted: data }, txn, jurisdiction)
  })
}

export function matchReceipt(db: Db, orgId: string, id: string, transactionId: string, jurisdiction: Jurisdiction): { vatRateBp: number | null } {
  return db.transaction(() => {
    const receipt = getReceipt(db, orgId, id)
    if (!receipt) throw new ReceiptError("Receipt not found")
    if (receipt.transactionId) throw new ReceiptError("Detach this receipt before attaching it elsewhere", 409)
    const txn = attachableTransaction(db, orgId, transactionId)
    db.update(attachments).set({ transactionId, suggestedTransactionId: null }).where(eq(attachments.id, id)).run()
    return { vatRateBp: applyRate(db, orgId, receipt, txn, jurisdiction) }
  })
}

/** Back to the inbox; the transaction loses only the rate this receipt gave it. */
export function unmatchReceipt(db: Db, orgId: string, id: string) {
  db.transaction(() => {
    const receipt = getReceipt(db, orgId, id)
    if (!receipt?.transactionId) return
    revertRate(db, orgId, receipt)
    db.update(attachments).set({ transactionId: null, appliedVatRateBp: null }).where(eq(attachments.id, id)).run()
  })
}

export function deleteReceipt(db: Db, orgId: string, id: string): Receipt | null {
  return db.transaction(() => {
    const receipt = getReceipt(db, orgId, id)
    if (!receipt) return null
    revertRate(db, orgId, receipt)
    db.delete(attachments).where(eq(attachments.id, id)).run()
    return receipt
  })
}

/** The receipt attached to a transaction, if any. */
export function receiptForTransaction(db: Db, orgId: string, transactionId: string): Receipt | null {
  return (
    db
      .select()
      .from(attachments)
      .where(and(eq(attachments.orgId, orgId), eq(attachments.transactionId, transactionId)))
      .get() ?? null
  )
}

/** Reading jobs live in memory: anything still being read after a restart is left for the user to handle by hand. */
export function recoverInterruptedReceipts(db: Db) {
  db.update(attachments).set({ readStatus: "failed" }).where(eq(attachments.readStatus, "processing")).run()
}

/** Receipts uploaded since `since` (ms) — what the monthly AI-reading quota counts. */
export function receiptsUploadedSince(db: Db, orgId: string, since: Date): number {
  return db
    .select({ id: attachments.id })
    .from(attachments)
    .where(and(eq(attachments.orgId, orgId), gte(attachments.createdAt, since)))
    .all().length
}
