"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { evaluateTriggers } from "@/advisory/evaluate"
import { db } from "@/db/client"
import { audit, requireReadyOrg } from "@/server/context"
import {
  createDraft,
  deleteDraft,
  duplicateInvoice,
  finalizeInvoice,
  InvoiceError,
  saveDraft,
  setInvoiceStatus,
} from "@/server/repos/invoices"

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

export type InvoiceActionResult = { ok: true } | { ok: false; error: string }

async function guarded(fn: () => void | Promise<void>): Promise<InvoiceActionResult> {
  try {
    await fn()
    return { ok: true }
  } catch (error) {
    if (error instanceof InvoiceError) return { ok: false, error: error.message }
    throw error
  }
}

export async function newInvoice(clientId?: string) {
  const ctx = await requireReadyOrg()
  const id = createDraft(db, ctx.orgId, ctx.settings, ctx.today, clientId ?? null)
  audit(ctx, "invoice.created", "invoice", id)
  redirect(`/invoices/${id}`)
}

export async function saveInvoiceDraft(id: string, input: unknown): Promise<InvoiceActionResult> {
  const ctx = await requireReadyOrg()
  const parsed = draftSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid invoice" }
  return guarded(() => saveDraft(db, ctx.orgId, id, parsed.data))
}

export async function finalize(id: string): Promise<InvoiceActionResult> {
  const ctx = await requireReadyOrg()
  const result = await guarded(() => {
    const number = finalizeInvoice(db, ctx.orgId, ctx.jurisdiction, id)
    audit(ctx, "invoice.finalized", "invoice", id, { number })
  })
  if (result.ok) {
    evaluateTriggers(db, ctx.orgId)
    revalidatePath("/invoices")
  }
  return result
}

export async function markPaid(id: string, paidDate: string): Promise<InvoiceActionResult> {
  const ctx = await requireReadyOrg()
  if (!isoDate.safeParse(paidDate).success) return { ok: false, error: "Invalid date" }
  const result = await guarded(() => {
    setInvoiceStatus(db, ctx.orgId, id, { to: "paid", paidDate })
    audit(ctx, "invoice.paid", "invoice", id, { paidDate })
  })
  if (result.ok) {
    evaluateTriggers(db, ctx.orgId)
    revalidatePath("/invoices")
  }
  return result
}

export async function markUnpaid(id: string): Promise<InvoiceActionResult> {
  const ctx = await requireReadyOrg()
  const result = await guarded(() => {
    setInvoiceStatus(db, ctx.orgId, id, { to: "finalized" })
    audit(ctx, "invoice.unpaid", "invoice", id)
  })
  revalidatePath("/invoices")
  return result
}

export async function voidInvoice(id: string): Promise<InvoiceActionResult> {
  const ctx = await requireReadyOrg()
  const result = await guarded(() => {
    setInvoiceStatus(db, ctx.orgId, id, { to: "void" })
    audit(ctx, "invoice.voided", "invoice", id)
  })
  revalidatePath("/invoices")
  return result
}

export async function removeDraft(id: string) {
  const ctx = await requireReadyOrg()
  deleteDraft(db, ctx.orgId, id)
  audit(ctx, "invoice.deleted", "invoice", id)
  redirect("/invoices")
}

export async function duplicate(id: string) {
  const ctx = await requireReadyOrg()
  const copy = duplicateInvoice(db, ctx.orgId, ctx.settings, ctx.today, id)
  audit(ctx, "invoice.duplicated", "invoice", copy, { from: id })
  redirect(`/invoices/${copy}`)
}
