import "server-only"
import { z } from "zod"
import { workspaceMetrics } from "@/advisory/evaluate"
import type { Db } from "@/db/client"
import type { CloseSummary } from "@/db/schema"
import type { LlmPort } from "@/ingest/llm/client"
import type { Jurisdiction } from "@/jurisdictions"
import { addDays, monthLabel } from "@/lib/dates"
import { env } from "@/lib/env"
import { monthPnl } from "@/server/repos/books"
import type { WorkspaceSettings } from "@/server/repos/workspace"
import { taxProfileOf } from "@/server/repos/workspace"
import { draftSummary } from "./pnl"

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
  /** null = deterministic summary only (no key configured, or throttled). */
  llm: LlmPort | null
}): Promise<CloseSummary> {
  const { db, orgId, month, settings, jurisdiction } = input
  const pnl = monthPnl(db, orgId, month)
  const metrics = workspaceMetrics(db, orgId, input.today)
  const next = jurisdiction.taxDeadlines(taxProfileOf(settings), input.today, addDays(input.today, 45))[0] ?? null
  const draft = draftSummary({ monthLabel: monthLabel(month), pnl, currency: settings.currency, locale: settings.locale, overdueMinor: metrics.overdueMinor, nextDeadline: next })
  const { llm } = input
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
