import "server-only"
import type { Db } from "@/db/client"
import { getJurisdiction } from "@/jurisdictions"
import { env } from "@/lib/env"
import { defaultLlm, type LlmPort } from "@/ingest/llm/client"
import { applyAiSuggestions, applyAssignments, humanExamples, listAccounts, listRules, uncategorized } from "@/server/repos/ledger"
import { getSettings } from "@/server/repos/workspace"
import { suggestAccounts } from "./ai-categorize"
import { categorizeDeterministic } from "./categorize"

/**
 * Full categorization pass for a workspace: heuristics and rules synchronously, then the AI for the remainder.
 * AI failures are non-fatal — rows simply stay in the review queue.
 */
export async function categorizeWorkspace(db: Db, orgId: string, llm: LlmPort | null = defaultLlm()): Promise<{ deterministic: number; ai: number }> {
  const settings = getSettings(db, orgId)
  const accounts = listAccounts(db, orgId)
  if (!settings.jurisdiction || !accounts.length) return { deterministic: 0, ai: 0 }
  const jurisdiction = getJurisdiction(settings.jurisdiction)
  const incomeCode = (settings.smallBusinessExempt && jurisdiction.exemptIncomeCode) || jurisdiction.chartOfAccounts.find((a) => a.kind === "income")?.code

  const pending = uncategorized(db, orgId)
  const assignments = categorizeDeterministic(pending, accounts, listRules(db, orgId), { incomeCode })
  applyAssignments(db, orgId, assignments)

  const remaining = pending.filter((t) => !assignments.has(t.id))
  if (!remaining.length || !llm) return { deterministic: assignments.size, ai: 0 }
  try {
    const suggestions = await suggestAccounts({
      llm,
      model: env().LLM_TEXT_MODEL,
      accounts,
      examples: humanExamples(db, orgId),
      txns: remaining,
      currency: settings.currency,
    })
    applyAiSuggestions(db, orgId, suggestions, env().AI_AUTO_ACCEPT)
    return { deterministic: assignments.size, ai: suggestions.size }
  } catch (error) {
    console.error("[categorize] AI pass failed", error)
    return { deterministic: assignments.size, ai: 0 }
  }
}
