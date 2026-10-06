"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { evaluateTriggers } from "@/advisory/evaluate"
import { CURRENCIES } from "@/db/schema"
import { db } from "@/db/client"
import type { DocumentKind } from "@/invoicing/documents"
import { finalizeWithRate, sendDocument, workspaceCanEmail } from "@/invoicing/service"
import { guarded, type ActionResult } from "@/lib/action-result"
import { audit, requireReadyOrg, type ReadyOrgContext } from "@/server/context"
import { exchangeRateMicro } from "@/server/repos/fx"
import {
  cancelInvoice,
  clearPayments,
  convertQuote,
  createDraft,
  deleteDraft,
  duplicateDocument,
  getInvoice,
  InvoiceError,
  recordPayment,
  saveDraft,
  setQuoteOutcome,
} from "@/server/repos/invoices"
import { bumpProductUsage } from "@/server/repos/products"
import { createSeries, updateSeries } from "@/server/repos/recurring"

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const kindSchema = z.enum(["invoice", "quote", "credit_note"])

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

const listPath = (kind: DocumentKind) => (kind === "quote" ? "/quotes" : "/invoices")

/** Anything that changes what is owed or paid feeds the advisory metrics and every list. */
function afterMoneyChange(ctx: ReadyOrgContext) {
  evaluateTriggers(db, ctx.orgId)
  revalidatePath("/", "layout")
}

export async function newDocument(kind: DocumentKind, clientId?: string) {
  const ctx = await requireReadyOrg()
  const id = createDraft(db, ctx.orgId, ctx.settings, ctx.today, { kind: kindSchema.parse(kind), clientId: clientId ?? null })
  audit(ctx, `${kind}.created`, "invoice", id)
  redirect(`/invoices/${id}`)
}

export async function saveInvoiceDraft(id: string, input: unknown): Promise<ActionResult> {
  const ctx = await requireReadyOrg()
  const parsed = draftSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid document" }
  const { productIds, ...draft } = parsed.data
  return guarded(() => {
    saveDraft(db, ctx.orgId, id, draft)
    for (const productId of productIds) bumpProductUsage(db, ctx.orgId, productId)
    // Autosave fires constantly; only bookkeeper edits on a client's document are worth an audit row.
    if (ctx.actor === "staff") audit(ctx, "invoice.draft_saved", "invoice", id)
  })
}

export async function finalize(id: string): Promise<ActionResult> {
  const ctx = await requireReadyOrg()
  const result = await guarded(async () => {
    const number = await finalizeWithRate(db, ctx.orgId, ctx.jurisdiction, id)
    audit(ctx, "invoice.finalized", "invoice", id, { number })
  })
  if (result.ok) afterMoneyChange(ctx)
  return result
}

export async function sendByEmail(id: string, to?: string): Promise<ActionResult> {
  const ctx = await requireReadyOrg()
  return guarded(async () => {
    const recipient = await sendDocument(db, ctx.orgId, ctx.jurisdiction, id, z.string().email().optional().catch(undefined).parse(to))
    audit(ctx, "invoice.sent", "invoice", id, { to: recipient })
    revalidatePath(`/invoices/${id}`)
    return { message: `Sent to ${recipient}` }
  })
}

const paymentSchema = z.object({ date: isoDate, amountMinor: z.number().int().positive() })

export async function addPayment(id: string, input: unknown): Promise<ActionResult> {
  const ctx = await requireReadyOrg()
  const parsed = paymentSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Enter a date and a positive amount" }
  const result = await guarded(() => {
    recordPayment(db, ctx.orgId, id, { ...parsed.data, method: "manual" })
    audit(ctx, "invoice.payment", "invoice", id, parsed.data)
  })
  if (result.ok) afterMoneyChange(ctx)
  return result
}

export async function undoPayments(id: string): Promise<ActionResult> {
  const ctx = await requireReadyOrg()
  const result = await guarded(() => {
    clearPayments(db, ctx.orgId, id)
    audit(ctx, "invoice.payments_cleared", "invoice", id)
  })
  if (result.ok) afterMoneyChange(ctx)
  return result
}

/** Cancellation by credit note (Stornorechnung) — the GoBD-compliant way to "void" an issued invoice. */
export async function cancelWithCreditNote(id: string): Promise<ActionResult> {
  const ctx = await requireReadyOrg()
  const result = await guarded(async () => {
    const invoice = getInvoice(db, ctx.orgId, id)?.invoice
    if (!invoice) throw new InvoiceError("Invoice not found")
    const rate = await exchangeRateMicro(db, invoice.currency, ctx.settings.currency, ctx.today)
    const { number } = cancelInvoice(db, ctx.orgId, ctx.jurisdiction, id, ctx.today, rate)
    audit(ctx, "invoice.cancelled", "invoice", id, { creditNote: number })
    return { message: `Cancelled — credit note ${number} issued` }
  })
  if (result.ok) afterMoneyChange(ctx)
  return result
}

export async function quoteOutcome(id: string, outcome: "accepted" | "declined"): Promise<ActionResult> {
  const ctx = await requireReadyOrg()
  const result = await guarded(() => {
    setQuoteOutcome(db, ctx.orgId, id, z.enum(["accepted", "declined"]).parse(outcome))
    audit(ctx, `quote.${outcome}`, "invoice", id)
  })
  if (result.ok) revalidatePath("/", "layout")
  return result
}

export async function convertToInvoice(id: string): Promise<ActionResult> {
  const ctx = await requireReadyOrg()
  let invoiceId = ""
  const result = await guarded(() => {
    invoiceId = convertQuote(db, ctx.orgId, ctx.settings, ctx.today, id)
    audit(ctx, "quote.converted", "invoice", id, { invoiceId })
  })
  if (result.ok) redirect(`/invoices/${invoiceId}`)
  return result
}

export async function removeDraft(id: string): Promise<ActionResult> {
  const ctx = await requireReadyOrg()
  const kind = getInvoice(db, ctx.orgId, id)?.invoice.kind ?? "invoice"
  const result = await guarded(() => {
    deleteDraft(db, ctx.orgId, id)
    audit(ctx, "invoice.deleted", "invoice", id)
  })
  if (result.ok) redirect(listPath(kind))
  return result
}

export async function duplicate(id: string): Promise<ActionResult> {
  const ctx = await requireReadyOrg()
  let copy = ""
  const result = await guarded(() => {
    copy = duplicateDocument(db, ctx.orgId, ctx.settings, ctx.today, id)
    audit(ctx, "invoice.duplicated", "invoice", copy, { from: id })
  })
  if (result.ok) redirect(`/invoices/${copy}`)
  return result
}

const recurringSchema = z.object({
  frequency: z.enum(["weekly", "monthly", "quarterly", "yearly"]),
  startDate: isoDate,
  count: z.number().int().min(1).max(500).nullable(),
  autoSend: z.boolean(),
})

/** Turns an invoice into a recurring series: its content becomes the template for every future invoice. */
export async function makeRecurring(id: string, input: unknown): Promise<ActionResult> {
  const ctx = await requireReadyOrg()
  const parsed = recurringSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Choose a frequency and a start date" }
  if (parsed.data.startDate < ctx.today) return { ok: false, error: "The first invoice can't be in the past" }
  if (parsed.data.autoSend && !workspaceCanEmail(ctx.settings)) return { ok: false, error: "Automatic sending needs email to be set up" }
  return guarded(() => {
    const templateId = duplicateDocument(db, ctx.orgId, ctx.settings, parsed.data.startDate, id, "invoice")
    const seriesId = createSeries(db, ctx.orgId, {
      templateInvoiceId: templateId,
      frequency: parsed.data.frequency,
      nextIssueDate: parsed.data.startDate,
      endDate: null,
      remaining: parsed.data.count,
      autoSend: parsed.data.autoSend,
    })
    audit(ctx, "recurring.created", "recurring_series", seriesId, parsed.data)
    revalidatePath("/invoices")
    return { message: `Recurring ${parsed.data.frequency} invoice scheduled from ${parsed.data.startDate}` }
  })
}

export async function setRecurringActive(seriesId: string, active: boolean) {
  const ctx = await requireReadyOrg()
  updateSeries(db, ctx.orgId, seriesId, { active })
  audit(ctx, active ? "recurring.resumed" : "recurring.paused", "recurring_series", seriesId)
  revalidatePath("/invoices")
}
