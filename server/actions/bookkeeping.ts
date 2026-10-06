"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { evaluateTriggers } from "@/advisory/evaluate"
import { suggestRule } from "@/bookkeeping/categorize"
import { categorizeWorkspace } from "@/bookkeeping/service"
import { db } from "@/db/client"
import { defaultLlm } from "@/ingest/llm/client"
import { DomainError, guarded, type ActionResult } from "@/lib/action-result"
import { limits } from "@/lib/rate-limit"
import { audit, requireReadyOrg, type ReadyOrgContext } from "@/server/context"
import { createRule, deleteRule, deleteTransaction, getTransaction, setAccounts, suggestedAccounts, updateTransactionDetails } from "@/server/repos/ledger"

const ids = z.array(z.string()).min(1).max(500)

/** Categories feed the P&L and the margin alert. */
function afterLedgerChange(ctx: ReadyOrgContext) {
  evaluateTriggers(db, ctx.orgId)
  revalidatePath("/", "layout")
}

/** Throttled access to the paid model; null means "rules only this time". */
function throttledLlm(ctx: ReadyOrgContext) {
  return limits.llm(ctx.orgId) ? defaultLlm() : null
}

/** Human categorization. For a single line, says whether a reusable rule could be built from it. */
export async function assignAccount(transactionIds: string[], accountId: string): Promise<ActionResult<{ suggestRuleFor?: string }>> {
  const ctx = await requireReadyOrg()
  const parsed = ids.safeParse(transactionIds)
  if (!parsed.success) return { ok: false, error: "Nothing selected" }
  const result = await guarded(() => {
    setAccounts(db, ctx.orgId, new Map(parsed.data.map((id) => [id, accountId])))
    audit(ctx, "transactions.categorized", "transaction", parsed.data.length === 1 ? parsed.data[0] : null, { count: parsed.data.length, accountId })
    const single = parsed.data.length === 1 ? getTransaction(db, ctx.orgId, parsed.data[0]) : null
    return { suggestRuleFor: single && suggestRule(single, accountId) ? single.id : undefined }
  })
  if (result.ok) afterLedgerChange(ctx)
  return result
}

const detailsSchema = z.object({ note: z.string().max(2000).optional(), vatRateBp: z.number().int().min(0).max(10_000).nullable().optional() })

export async function saveTransactionDetails(id: string, input: unknown): Promise<ActionResult> {
  const ctx = await requireReadyOrg()
  const parsed = detailsSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Invalid details" }
  const result = await guarded(() => {
    updateTransactionDetails(db, ctx.orgId, id, parsed.data)
    audit(ctx, "transaction.details", "transaction", id, parsed.data)
  })
  if (result.ok) revalidatePath("/transactions")
  return result
}

/** Accepts the pre-filled suggestions on the given rows as they are — in one transaction. */
export async function acceptSuggestions(transactionIds: string[]): Promise<ActionResult> {
  const ctx = await requireReadyOrg()
  const parsed = ids.safeParse(transactionIds)
  if (!parsed.success) return { ok: false, error: "Nothing selected" }
  const result = await guarded(() => {
    const decisions = suggestedAccounts(db, ctx.orgId, parsed.data)
    setAccounts(db, ctx.orgId, decisions)
    audit(ctx, "transactions.accepted_ai", "transaction", null, { count: decisions.size })
    return { message: `${decisions.size} suggestion${decisions.size === 1 ? "" : "s"} accepted` }
  })
  if (result.ok) afterLedgerChange(ctx)
  return result
}

export async function createRuleFromTransaction(transactionId: string): Promise<ActionResult> {
  const ctx = await requireReadyOrg()
  const result = await guarded(async () => {
    const txn = getTransaction(db, ctx.orgId, transactionId)
    if (!txn?.ledgerAccountId) throw new DomainError("Categorize the transaction first")
    const rule = suggestRule(txn, txn.ledgerAccountId)
    if (!rule) throw new DomainError("Not enough detail to build a rule from this line")
    const id = createRule(db, ctx.orgId, rule)
    audit(ctx, "rule.created", "rule", id, rule)
    // Apply the new rule to everything still waiting.
    await categorizeWorkspace(db, ctx.orgId, throttledLlm(ctx))
    return { message: `Rule saved: “${rule.pattern}” will be categorized automatically` }
  })
  if (result.ok) afterLedgerChange(ctx)
  return result
}

export async function removeRule(ruleId: string) {
  const ctx = await requireReadyOrg()
  deleteRule(db, ctx.orgId, ruleId)
  audit(ctx, "rule.deleted", "rule", ruleId)
  revalidatePath("/books")
}

export async function rerunCategorization(): Promise<ActionResult> {
  const ctx = await requireReadyOrg()
  const llm = throttledLlm(ctx)
  const result = await categorizeWorkspace(db, ctx.orgId, llm)
  audit(ctx, "transactions.recategorized", "transaction", null, result)
  afterLedgerChange(ctx)
  const processed = result.deterministic + result.ai
  return { ok: true, message: llm ? `${processed} transactions processed` : `${processed} matched by rules — AI suggestions resume in a few minutes` }
}

export async function removeTransaction(id: string): Promise<ActionResult> {
  const ctx = await requireReadyOrg()
  const result = await guarded(() => {
    deleteTransaction(db, ctx.orgId, id)
    audit(ctx, "transaction.deleted", "transaction", id)
  })
  if (result.ok) afterLedgerChange(ctx)
  return result
}
