"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { evaluateTriggers } from "@/advisory/evaluate"
import { db } from "@/db/client"
import { guarded, type ActionResult } from "@/lib/action-result"
import { audit, requireReadyOrg, type ReadyOrgContext } from "@/server/context"
import { createDraft, deleteDraft, duplicateInvoice, finalizeInvoice, saveDraft, setInvoiceStatus, type StatusChange } from "@/server/repos/invoices"

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const draftSchema = z.object({
  clientId: z.string().nullable(),
  issueDate: isoDate,
  serviceDate: isoDate.nullable(),
  dueDate: isoDate,
  notes: z.string().max(4000),
  paymentTerms: z.string().max(200),
  stripePaymentLink: z.union([z.literal(""), z.string().url().startsWith("https://")]),
  lines: z
    .array(
      z.object({
        description: z.string().max(500),
        quantityMilli: z.number().int().min(-1_000_000_000).max(1_000_000_000),
        unitPriceMinor: z.number().int().min(-100_000_000_000).max(100_000_000_000),
        taxRateBp: z.number().int().min(0).max(10_000),
      }),
    )
    .max(200),
})

/** Anything that changes what is owed or paid feeds the advisory metrics and the invoice screens. */
function afterMoneyChange(ctx: ReadyOrgContext) {
  evaluateTriggers(db, ctx.orgId)
  revalidatePath("/", "layout")
}

export async function newInvoice(clientId?: string) {
  const ctx = await requireReadyOrg()
  const id = createDraft(db, ctx.orgId, ctx.settings, ctx.today, clientId ?? null)
  audit(ctx, "invoice.created", "invoice", id)
  redirect(`/invoices/${id}`)
}

export async function saveInvoiceDraft(id: string, input: unknown): Promise<ActionResult> {
  const ctx = await requireReadyOrg()
  const parsed = draftSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid invoice" }
  return guarded(() => {
    saveDraft(db, ctx.orgId, id, parsed.data)
    // Autosave fires constantly; only bookkeeper edits on a client's invoice are worth an audit row.
    if (ctx.actor === "staff") audit(ctx, "invoice.draft_saved", "invoice", id)
  })
}

export async function finalize(id: string): Promise<ActionResult> {
  const ctx = await requireReadyOrg()
  const result = await guarded(() => {
    const number = finalizeInvoice(db, ctx.orgId, ctx.jurisdiction, id)
    audit(ctx, "invoice.finalized", "invoice", id, { number })
  })
  if (result.ok) afterMoneyChange(ctx)
  return result
}

const statusChange = z.discriminatedUnion("to", [
  z.object({ to: z.literal("paid"), paidDate: isoDate }),
  z.object({ to: z.literal("finalized") }),
  z.object({ to: z.literal("void") }),
])

/** Mark paid / unpaid / void. */
export async function changeInvoiceStatus(id: string, change: StatusChange): Promise<ActionResult> {
  const ctx = await requireReadyOrg()
  const parsed = statusChange.safeParse(change)
  if (!parsed.success) return { ok: false, error: "Invalid status change" }
  const result = await guarded(() => {
    setInvoiceStatus(db, ctx.orgId, id, parsed.data)
    audit(ctx, `invoice.${parsed.data.to === "finalized" ? "unpaid" : parsed.data.to}`, "invoice", id, parsed.data)
  })
  if (result.ok) afterMoneyChange(ctx)
  return result
}

export async function removeDraft(id: string): Promise<ActionResult> {
  const ctx = await requireReadyOrg()
  const result = await guarded(() => {
    deleteDraft(db, ctx.orgId, id)
    audit(ctx, "invoice.deleted", "invoice", id)
  })
  if (result.ok) redirect("/invoices")
  return result
}

export async function duplicate(id: string): Promise<ActionResult> {
  const ctx = await requireReadyOrg()
  let copy = ""
  const result = await guarded(() => {
    copy = duplicateInvoice(db, ctx.orgId, ctx.settings, ctx.today, id)
    audit(ctx, "invoice.duplicated", "invoice", copy, { from: id })
  })
  if (result.ok) redirect(`/invoices/${copy}`)
  return result
}
