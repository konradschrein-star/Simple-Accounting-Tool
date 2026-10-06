import "server-only"
import path from "node:path"
import { and, eq } from "drizzle-orm"
import pLimit from "p-limit"
import { db } from "@/db/client"
import { importBatches } from "@/db/schema"
import { env } from "@/lib/env"
import { LlmError, openRouterStructured } from "@/ingest/llm/client"
import { extractStatement } from "@/ingest/pdf/extract"
import { PdfError, pdfInfo, pdfPageImages, pdfPageTexts } from "@/ingest/pdf/poppler"
import { getBatch, stageRows, updateBatch } from "@/server/repos/imports"
import { getSettings } from "@/server/repos/workspace"

/** Process-wide cap on concurrent statement extractions (each fans out to ≤3 page calls). */
const jobs = pLimit(2)

export function enqueuePdfImport(orgId: string, batchId: string) {
  updateBatch(db, orgId, batchId, { status: "parsing", errorCode: null, errorMessage: null })
  void jobs(() => runPdfImport(orgId, batchId))
}

async function runPdfImport(orgId: string, batchId: string) {
  const batch = getBatch(db, orgId, batchId)
  if (!batch?.filePath) return
  const file = path.join(path.resolve(env().DATA_DIR), batch.filePath)
  const settings = getSettings(db, orgId)
  try {
    const info = await pdfInfo(file)
    if (info.encrypted) throw new PdfError("ENCRYPTED_PDF", "The PDF is password-protected")
    if (info.pages > env().MAX_PDF_PAGES) throw new PdfError("TOO_MANY_PAGES", `Statements are limited to ${env().MAX_PDF_PAGES} pages`)
    if (!env().OPENROUTER_API_KEY) throw new LlmError("LLM_UNAVAILABLE", "AI parsing is not configured")
    const pageTexts = await pdfPageTexts(file)
    updateBatch(db, orgId, batchId, { llmCalled: true })
    const e = env()
    const extraction = await extractStatement({
      llm: openRouterStructured,
      models: { text: e.LLM_TEXT_MODEL, vision: e.LLM_VISION_MODEL, escalation: e.LLM_ESCALATION_MODEL },
      pageTexts,
      renderImages: () => pdfPageImages(file, info.pages),
    })
    if (!extraction.rows.length) {
      updateBatch(db, orgId, batchId, { status: "failed", errorCode: "NO_TRANSACTIONS_FOUND", errorMessage: "No transactions were found in this PDF." })
      return
    }
    if (extraction.currency && extraction.currency !== settings.currency) {
      updateBatch(db, orgId, batchId, {
        status: "failed",
        errorCode: "CURRENCY_MISMATCH",
        detectedCurrency: extraction.currency,
        errorMessage: `This statement is in ${extraction.currency}, but your workspace uses ${settings.currency}.`,
      })
      return
    }
    updateBatch(db, orgId, batchId, { attempts: extraction.attempts, detectedCurrency: extraction.currency })
    stageRows(db, orgId, batchId, extraction.rows, { reconciliation: extraction.reconciliation, parser: extraction.parser, modelUsed: extraction.model })
  } catch (error) {
    const code = error instanceof PdfError || error instanceof LlmError ? error.code : "LLM_INVALID_OUTPUT"
    console.error(`[import ${batchId}]`, error)
    updateBatch(db, orgId, batchId, { status: "failed", errorCode: code, errorMessage: error instanceof Error ? error.message : String(error) })
  }
}

/** Jobs live in memory: anything still "parsing" after a restart was interrupted. */
export function recoverInterruptedImports() {
  db.update(importBatches)
    .set({ status: "failed", errorCode: "INTERRUPTED", errorMessage: "Processing was interrupted by a restart. Please retry." })
    .where(and(eq(importBatches.status, "parsing")))
    .run()
}
