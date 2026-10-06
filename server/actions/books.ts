"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { draftCloseSummary } from "@/bookkeeping/close-service"
import { closeReady } from "@/bookkeeping/pnl"
import { db } from "@/db/client"
import { audit, requireReadyOrg } from "@/server/context"
import { closePeriod, monthChecklist, reopenPeriod, saveCloseDraft } from "@/server/repos/books"

const month = z.string().regex(/^\d{4}-\d{2}$/)
const summarySchema = z.object({
  headline: z.string().trim().min(1).max(200),
  bullets: z.array(z.string().trim().max(400)).max(8),
  watchItems: z.array(z.string().trim().max(400)).max(6),
})

export type BooksResult = { ok: true } | { ok: false; error: string }

export async function prepareClose(period: string): Promise<BooksResult> {
  const ctx = await requireReadyOrg()
  if (!month.safeParse(period).success) return { ok: false, error: "Invalid month" }
  const checklist = monthChecklist(db, ctx.orgId, period)
  const aiSummary = await draftCloseSummary({ db, orgId: ctx.orgId, month: period, settings: ctx.settings, jurisdiction: ctx.jurisdiction, today: ctx.today })
  saveCloseDraft(db, ctx.orgId, period, { checklist, aiSummary })
  audit(ctx, "close.drafted", "period_close", period)
  revalidatePath("/books")
  return { ok: true }
}

export async function closeMonth(period: string, summary: unknown): Promise<BooksResult> {
  const ctx = await requireReadyOrg()
  const parsedSummary = summarySchema.safeParse(summary)
  if (!month.safeParse(period).success || !parsedSummary.success) return { ok: false, error: "Invalid close" }
  if (period >= ctx.today.slice(0, 7)) return { ok: false, error: "A month can only be closed after it has ended." }
  const checklist = monthChecklist(db, ctx.orgId, period)
  if (!closeReady(checklist)) return { ok: false, error: "Resolve the open checklist items first." }
  closePeriod(db, ctx.orgId, period, ctx.user.id, checklist, parsedSummary.data)
  audit(ctx, "close.closed", "period_close", period, { checklist })
  revalidatePath("/", "layout")
  return { ok: true }
}

export async function reopenMonth(period: string): Promise<BooksResult> {
  const ctx = await requireReadyOrg()
  if (!month.safeParse(period).success) return { ok: false, error: "Invalid month" }
  reopenPeriod(db, ctx.orgId, period)
  audit(ctx, "close.reopened", "period_close", period)
  revalidatePath("/", "layout")
  return { ok: true }
}
