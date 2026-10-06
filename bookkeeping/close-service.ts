import "server-only"
import { z } from "zod"
import { workspaceMetrics } from "@/advisory/evaluate"
import type { Db } from "@/db/client"
import type { CloseSummary } from "@/db/schema"
import { openRouterStructured, type LlmPort } from "@/ingest/llm/client"
import type { Jurisdiction } from "@/jurisdictions"
import { addDays, lastDayOfMonth } from "@/lib/dates"
import { env } from "@/lib/env"
import { listAccounts } from "@/server/repos/ledger"
import { pnlInputs } from "@/server/repos/books"
import type { WorkspaceSettings } from "@/server/repos/workspace"
import { taxProfileOf } from "@/server/repos/workspace"
import { computePnl, draftSummary, type Pnl } from "./pnl"

export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number)
  return { from: `${month}-01`, to: lastDayOfMonth(y, m) }
}

export function priorMonth(month: string): string {
  const [y, m] = month.split("-").map(Number)
  const d = new Date(Date.UTC(y, m - 2, 1))
  return d.toISOString().slice(0, 7)
}

export function monthPnl(db: Db, orgId: string, month: string): Pnl {
  const inputs = pnlInputs(db, orgId)
  return computePnl({ ...inputs, accounts: listAccounts(db, orgId), period: monthRange(month), prior: monthRange(priorMonth(month)) })
}

const summarySchema = z.object({ headline: z.string(), bullets: z.array(z.string()).max(6), watchItems: z.array(z.string()).max(4) })

/**
 * Month-end narrative for the client. Facts come from the deterministic draft; the LLM (when configured)
 * only rewrites them into plain, friendly language — it is told never to add numbers.
 */
export async function draftCloseSummary(input: {
  db: Db
  orgId: string
  month: string
  settings: WorkspaceSettings
  jurisdiction: Jurisdiction
  today: string
  llm?: LlmPort
}): Promise<CloseSummary> {
  const { db, orgId, month, settings, jurisdiction } = input
  const pnl = monthPnl(db, orgId, month)
  const metrics = workspaceMetrics(db, orgId, input.today)
  const next = jurisdiction.taxDeadlines(taxProfileOf(settings), input.today, addDays(input.today, 45))[0] ?? null
  const monthLabel = new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })
  const draft = draftSummary({ monthLabel, pnl, currency: settings.currency, locale: settings.locale, overdueMinor: metrics.overdueMinor, nextDeadline: next })
  const llm = input.llm ?? (env().OPENROUTER_API_KEY ? openRouterStructured : null)
  if (!llm) return draft
  try {
    const { data } = await llm({
      model: env().LLM_TEXT_MODEL,
      name: "month_close_summary",
      schema: summarySchema,
      system:
        "You are a friendly, precise bookkeeper writing a short month-end note to a small-business owner. Rewrite the given facts into clear, warm, plain English. Keep every number exactly as given and never introduce new numbers or facts. Headline ≤ 90 characters; 3–5 bullets; watch items only if provided.",
      user: JSON.stringify(draft),
      maxTokens: 1200,
    })
    return data
  } catch (error) {
    console.warn("[close] LLM summary failed, using draft:", error instanceof Error ? error.message : error)
    return draft
  }
}
