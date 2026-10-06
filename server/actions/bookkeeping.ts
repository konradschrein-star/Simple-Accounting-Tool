"use server"

import { and, eq, inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { evaluateTriggers } from "@/advisory/evaluate"
import { suggestRule } from "@/bookkeeping/categorize"
import { categorizeWorkspace } from "@/bookkeeping/service"
import { db } from "@/db/client"
import { transactions } from "@/db/schema"
import { audit, requireReadyOrg } from "@/server/context"
import { createRule, deleteRule, deleteTransaction, LedgerError, setAccount } from "@/server/repos/ledger"

export type BookkeepingResult = { ok: true; message?: string; suggestRuleFor?: string } | { ok: false; error: string }

const ids = z.array(z.string()).min(1).max(500)

async function guarded(fn: () => BookkeepingResult | Promise<BookkeepingResult>): Promise<BookkeepingResult> {
  try {
    return await fn()
  } catch (error) {
    if (error instanceof LedgerError) return { ok: false, error: error.message }
    throw error
  }
}

/** Human categorization. For a single line, returns its id when a reusable rule could be built from it. */
export async function assignAccount(transactionIds: string[], accountId: string): Promise<BookkeepingResult> {
  const ctx = await requireReadyOrg()
  const parsed = ids.safeParse(transactionIds)
  if (!parsed.success) return { ok: false, error: "Nothing selected" }
  return guarded(() => {
    setAccount(db, ctx.orgId, parsed.data, accountId)
    audit(ctx, "transactions.categorized", "transaction", parsed.data.length === 1 ? parsed.data[0] : null, { count: parsed.data.length, accountId })
    evaluateTriggers(db, ctx.orgId)
    revalidatePath("/", "layout")
    if (parsed.data.length !== 1) return { ok: true }
    const txn = db.select().from(transactions).where(and(eq(transactions.orgId, ctx.orgId), eq(transactions.id, parsed.data[0]))).get()
    return { ok: true, suggestRuleFor: txn && suggestRule(txn, accountId) ? txn.id : undefined }
  })
}

/** Accepts the pre-filled AI suggestions on the given rows as-is. */
export async function acceptSuggestions(transactionIds: string[]): Promise<BookkeepingResult> {
  const ctx = await requireReadyOrg()
  const parsed = ids.safeParse(transactionIds)
  if (!parsed.success) return { ok: false, error: "Nothing selected" }
  const rows = db
    .select({ id: transactions.id, accountId: transactions.ledgerAccountId })
    .from(transactions)
    .where(and(eq(transactions.orgId, ctx.orgId), inArray(transactions.id, parsed.data)))
    .all()
    .filter((r) => r.accountId)
  return guarded(() => {
    const byAccount = Map.groupBy(rows, (r) => r.accountId!)
    for (const [accountId, group] of byAccount) setAccount(db, ctx.orgId, group.map((r) => r.id), accountId)
    audit(ctx, "transactions.accepted_ai", "transaction", null, { count: rows.length })
    evaluateTriggers(db, ctx.orgId)
    revalidatePath("/", "layout")
    return { ok: true, message: `${rows.length} suggestions accepted` }
  })
}

export async function createRuleFromTransaction(transactionId: string): Promise<BookkeepingResult> {
  const ctx = await requireReadyOrg()
  const txn = db.select().from(transactions).where(and(eq(transactions.orgId, ctx.orgId), eq(transactions.id, transactionId))).get()
  if (!txn?.ledgerAccountId) return { ok: false, error: "Categorize the transaction first" }
  const rule = suggestRule(txn, txn.ledgerAccountId)
  if (!rule) return { ok: false, error: "Not enough detail to build a rule from this line" }
  const id = createRule(db, ctx.orgId, rule)
  audit(ctx, "rule.created", "rule", id, rule)
  // Apply the new rule to everything still waiting.
  await categorizeWorkspace(db, ctx.orgId)
  revalidatePath("/", "layout")
  return { ok: true, message: `Rule saved: “${rule.pattern}” will be categorized automatically` }
}

export async function removeRule(ruleId: string) {
  const ctx = await requireReadyOrg()
  deleteRule(db, ctx.orgId, ruleId)
  audit(ctx, "rule.deleted", "rule", ruleId)
  revalidatePath("/books")
}

export async function rerunCategorization(): Promise<BookkeepingResult> {
  const ctx = await requireReadyOrg()
  const result = await categorizeWorkspace(db, ctx.orgId)
  audit(ctx, "transactions.recategorized", "transaction", null, result)
  revalidatePath("/", "layout")
  return { ok: true, message: `${result.deterministic + result.ai} transactions processed` }
}

export async function removeTransaction(id: string): Promise<BookkeepingResult> {
  const ctx = await requireReadyOrg()
  return guarded(() => {
    deleteTransaction(db, ctx.orgId, id)
    audit(ctx, "transaction.deleted", "transaction", id)
    evaluateTriggers(db, ctx.orgId)
    revalidatePath("/transactions")
    return { ok: true }
  })
}
