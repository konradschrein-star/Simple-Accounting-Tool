"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { evaluateTriggers } from "@/advisory/evaluate"
import { categorizeWorkspace } from "@/bookkeeping/service"
import { db } from "@/db/client"
import { enqueuePdfImport } from "@/ingest/jobs"
import { csvMappingSchema } from "@/ingest/csv/types"
import { applyCsvMapping, pdfImportsThisMonth, removeImportFile } from "@/ingest/service"
import { isRetryable } from "@/ingest/status"
import type { ActionResult } from "@/lib/action-result"
import { env } from "@/lib/env"
import { audit, requireReadyOrg } from "@/server/context"
import { deleteBatch, editRows, getBatch, updateBatch } from "@/server/repos/imports"
import { commitBatch, LedgerError } from "@/server/repos/ledger"

async function loadBatch(id: string) {
  const ctx = await requireReadyOrg()
  const batch = getBatch(db, ctx.orgId, id)
  if (!batch) throw new Error("Import not found")
  return { ctx, batch }
}

export async function saveCsvMapping(id: string, input: unknown): Promise<ActionResult> {
  const { ctx, batch } = await loadBatch(id)
  const parsed = csvMappingSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Invalid column mapping" }
  if (parsed.data.columns.date === undefined) return { ok: false, error: "Choose the date column" }
  if (
    parsed.data.amountMode === "debitCredit"
      ? parsed.data.columns.debit === undefined && parsed.data.columns.credit === undefined
      : parsed.data.columns.amount === undefined
  )
    return { ok: false, error: "Choose the amount column(s)" }
  if (batch.status === "committed") return { ok: false, error: "This import is already booked" }
  applyCsvMapping({ orgId: ctx.orgId, jurisdiction: ctx.jurisdiction.code, currency: ctx.settings.currency }, batch, parsed.data)
  audit(ctx, "import.mapped", "import", id)
  revalidatePath(`/imports/${id}`)
  return { ok: true }
}

const editSchema = z.array(
  z.object({
    id: z.string(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    description: z.string().max(500).optional(),
    amountMinor: z.number().int().optional(),
    include: z.boolean().optional(),
    matchedInvoiceId: z.null().optional(),
  })
)

export async function saveImportEdits(id: string, edits: unknown): Promise<ActionResult> {
  const { ctx } = await loadBatch(id)
  const parsed = editSchema.safeParse(edits)
  if (!parsed.success) return { ok: false, error: "Invalid edit" }
  try {
    editRows(db, ctx.orgId, id, parsed.data)
    if (ctx.actor === "staff") audit(ctx, "import.rows_edited", "import", id, parsed.data)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not save" }
  }
  return { ok: true }
}

export async function commitImport(id: string): Promise<ActionResult> {
  const { ctx, batch } = await loadBatch(id)
  let result
  try {
    result = commitBatch(db, ctx.orgId, id)
  } catch (error) {
    if (error instanceof LedgerError) return { ok: false, error: error.message }
    throw error
  }
  audit(ctx, "import.committed", "import", id, result)
  if (env().DELETE_SOURCE_AFTER_COMMIT) {
    removeImportFile(batch)
    updateBatch(db, ctx.orgId, id, { filePath: null })
  }
  const categorized = await categorizeWorkspace(db, ctx.orgId)
  evaluateTriggers(db, ctx.orgId)
  revalidatePath("/", "layout")
  const paid = result.invoicesPaid ? ` · ${result.invoicesPaid} invoice${result.invoicesPaid > 1 ? "s" : ""} marked paid` : ""
  return { ok: true, message: `${result.inserted} transactions booked · ${categorized.deterministic + categorized.ai} auto-categorized${paid}` }
}

export async function retryImport(id: string) {
  const { ctx, batch } = await loadBatch(id)
  if (!isRetryable(batch)) return
  if (pdfImportsThisMonth(ctx.orgId, ctx.today) >= env().PDF_IMPORTS_PER_MONTH) return
  enqueuePdfImport(ctx.orgId, id)
  revalidatePath(`/imports/${id}`)
}

export async function deleteImport(id: string) {
  const { ctx, batch } = await loadBatch(id)
  if (batch.status === "committed") throw new Error("Booked imports cannot be deleted")
  removeImportFile(batch)
  deleteBatch(db, ctx.orgId, id)
  audit(ctx, "import.deleted", "import", id)
  redirect("/imports")
}
