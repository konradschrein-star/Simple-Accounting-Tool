"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { evaluateTriggers } from "@/advisory/evaluate"
import { CURRENCIES } from "@/db/schema"
import { db } from "@/db/client"
import type { DocumentKind } from "@/invoicing/documents"
import { guarded, type ActionResult } from "@/lib/action-result"
import { audit, requireReadyOrg, type ReadyOrgContext } from "@/server/context"
import { convertQuote, createDraft, deleteDraft, duplicateDocument, recordPayment, removePayment, saveDraft, setQuoteOutcome } from "@/server/repos/invoices"
import { bumpProductUsage } from "@/server/repos/products"
import { createSeries, setSeriesPaused } from "@/server/repos/recurring"
import { cancelWithRate, finalizeWithRate, sendDocument, workspaceCanEmail } from "@/server/services/invoicing"

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const id = z.string().min(1).max(64)

const draftSchema = z.object({
  clientId: z.string().nullable(),
  issueDate: isoDate,
  serviceDate: isoDate.nullable(),
  dueDate: isoDate,
  currency: z.enum(CURRENCIES),
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
        discountBp: z.number().int().min(0).max(10_000).default(0),
        unit: z.string().max(30).default(""),
      })
    )
    .max(200),
  productIds: z.array(z.string()).max(200).default([]),
})

const listPath = (kind: DocumentKind) => (kind === "quote" ? "/quotes" : kind === "recurring_template" ? "/invoices?tab=recurring" : "/invoices")

/** Anything that changes what is owed or paid feeds the advisory metrics and every list. */
function afterMoneyChange(ctx: ReadyOrgContext) {
  evaluateTriggers(db, ctx.orgId)
  revalidatePath("/", "layout")
}

export async function newDocument(kind: "invoice" | "quote", clientId?: string) {
  const ctx = await requireReadyOrg()
  const draftId = createDraft(db, ctx.orgId, ctx.settings, ctx.today, { kind: z.enum(["invoice", "quote"]).parse(kind), clientId: clientId ?? null })
  audit(ctx, `${kind}.created`, "invoice", draftId)
  redirect(`/invoices/${draftId}`)
}

export async function saveInvoiceDraft(documentId: string, input: unknown): Promise<ActionResult> {
  const ctx = await requireReadyOrg()
  const parsed = draftSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid document" }
  const { productIds, ...draft } = parsed.data
  return guarded(() => {
    saveDraft(db, ctx.orgId, documentId, draft)
    for (const productId of productIds) bumpProductUsage(db, ctx.orgId, productId)
    // Autosave fires constantly; only bookkeeper edits on a client's document are worth an audit row.
    if (ctx.actor === "staff") audit(ctx, "invoice.draft_saved", "invoice", documentId)
  })
}

export async function finalize(documentId: string): Promise<ActionResult> {
  const ctx = await requireReadyOrg()
  const result = await guarded(async () => {
    const number = await finalizeWithRate(db, ctx.orgId, documentId, ctx.today)
    audit(ctx, "invoice.finalized", "invoice", documentId, { number })
  })
  if (result.ok) afterMoneyChange(ctx)
  return result
}

export async function sendByEmail(documentId: string, to?: string): Promise<ActionResult> {
  const ctx = await requireReadyOrg()
  return guarded(async () => {
    const recipient = await sendDocument(db, ctx.orgId, documentId, z.string().email().optional().catch(undefined).parse(to))
    audit(ctx, "invoice.sent", "invoice", documentId, { to: recipient })
    revalidatePath(`/invoices/${documentId}`)
    return { message: `Sent to ${recipient}` }
  })
}

const paymentSchema = z.object({ date: isoDate, amountMinor: z.number().int().positive() })

export async function addPayment(documentId: string, input: unknown): Promise<ActionResult> {
  const ctx = await requireReadyOrg()
  const parsed = paymentSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Enter a date and a positive amount" }
  const result = await guarded(() => {
    recordPayment(db, ctx.orgId, documentId, { ...parsed.data, method: "manual" }, ctx.today)
    audit(ctx, "invoice.payment", "invoice", documentId, parsed.data)
  })
  if (result.ok) afterMoneyChange(ctx)
  return result
}

export async function deletePayment(paymentId: string): Promise<ActionResult> {
  const ctx = await requireReadyOrg()
  const result = await guarded(() => {
    removePayment(db, ctx.orgId, id.parse(paymentId), ctx.today)
    audit(ctx, "invoice.payment_removed", "invoice_payment", paymentId)
    return { message: "Payment removed" }
  })
  if (result.ok) afterMoneyChange(ctx)
  return result
}

/** Cancellation by credit note (Stornorechnung) — the GoBD-compliant way to withdraw an issued invoice. */
export async function cancelWithCreditNote(documentId: string): Promise<ActionResult> {
  const ctx = await requireReadyOrg()
  const result = await guarded(async () => {
    const { number } = await cancelWithRate(db, ctx.orgId, documentId, ctx.today)
    audit(ctx, "invoice.cancelled", "invoice", documentId, { creditNote: number })
    return { message: `Cancelled — credit note ${number} issued` }
  })
  if (result.ok) afterMoneyChange(ctx)
  return result
}

export async function quoteOutcome(documentId: string, outcome: "accepted" | "declined"): Promise<ActionResult> {
  const ctx = await requireReadyOrg()
  const result = await guarded(() => {
    setQuoteOutcome(db, ctx.orgId, documentId, z.enum(["accepted", "declined"]).parse(outcome), "user", ctx.today)
    audit(ctx, `quote.${outcome}`, "invoice", documentId)
  })
  if (result.ok) revalidatePath("/", "layout")
  return result
}

export async function convertToInvoice(documentId: string): Promise<ActionResult> {
  const ctx = await requireReadyOrg()
  const result = await guarded(() => {
    const invoiceId = convertQuote(db, ctx.orgId, ctx.settings, ctx.today, documentId)
    audit(ctx, "quote.converted", "invoice", documentId, { invoiceId })
    return { invoiceId }
  })
  if (result.ok) redirect(`/invoices/${result.invoiceId}`)
  return result
}

export async function removeDraft(documentId: string): Promise<ActionResult> {
  const ctx = await requireReadyOrg()
  const result = await guarded(() => {
    const kind = deleteDraft(db, ctx.orgId, documentId, ctx.today)
    audit(ctx, "invoice.deleted", "invoice", documentId)
    return { kind }
  })
  if (result.ok) redirect(listPath(result.kind))
  return result
}

export async function duplicate(documentId: string): Promise<ActionResult> {
  const ctx = await requireReadyOrg()
  const result = await guarded(() => {
    const copy = duplicateDocument(db, ctx.orgId, ctx.settings, ctx.today, documentId)
    audit(ctx, "invoice.duplicated", "invoice", copy, { from: documentId })
    return { copy }
  })
  if (result.ok) redirect(`/invoices/${result.copy}`)
  return result
}

const recurringSchema = z.object({
  frequency: z.enum(["weekly", "monthly", "quarterly", "yearly"]),
  startDate: isoDate,
  count: z.number().int().min(1).max(500).nullable(),
  autoSend: z.boolean(),
})

/** Turns an invoice into a recurring series: its content becomes the template for every future invoice. */
export async function makeRecurring(documentId: string, input: unknown): Promise<ActionResult> {
  const ctx = await requireReadyOrg()
  const parsed = recurringSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Choose a frequency and a start date" }
  const { frequency, startDate, count, autoSend } = parsed.data
  if (startDate < ctx.today) return { ok: false, error: "The first invoice can’t be in the past" }
  if (autoSend && !workspaceCanEmail(ctx.settings)) return { ok: false, error: "Automatic sending needs email to be set up" }
  return guarded(() => {
    const seriesId = createSeries(db, ctx.orgId, ctx.settings, documentId, { frequency, startDate, totalCount: count, autoSend }, ctx.today)
    audit(ctx, "recurring.created", "recurring_series", seriesId, parsed.data)
    revalidatePath("/invoices")
    return { message: `Recurring ${frequency} invoice scheduled from ${startDate}` }
  })
}

export async function setRecurringPaused(seriesId: string, paused: boolean): Promise<ActionResult> {
  const ctx = await requireReadyOrg()
  const result = await guarded(() => {
    setSeriesPaused(db, ctx.orgId, id.parse(seriesId), z.boolean().parse(paused), ctx.today)
    audit(ctx, paused ? "recurring.paused" : "recurring.resumed", "recurring_series", seriesId)
  })
  if (result.ok) revalidatePath("/invoices")
  return result
}
