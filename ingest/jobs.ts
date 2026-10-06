import "server-only"
import { eq } from "drizzle-orm"
import pLimit from "p-limit"
import { db } from "@/db/client"
import { importBatches } from "@/db/schema"
import { dataPath } from "@/lib/data-path"
import { env } from "@/lib/env"
import { defaultLlm, LlmError } from "@/ingest/llm/client"
import { extractStatement } from "@/ingest/pdf/extract"
import { PdfError, pdfInfo, pdfPageImages, pdfPageTexts } from "@/ingest/pdf/poppler"
import { getBatch, stageRows, updateBatch } from "@/server/repos/imports"
import { getSettings } from "@/server/repos/workspace"

/** Process-wide cap on concurrent statement extractions (each fans out to ≤3 page calls). */
const jobs = pLimit(2)

export function enqueuePdfImport(orgId: string, batchId: string) {
  updateBatch(db, orgId, batchId, { status: "parsing", errorCode: null, errorMessage: null })
  jobs(() => runPdfImport(orgId, batchId)).catch((error) => console.error(`[import ${batchId}] crashed`, error))
}

class ImportFailure extends Error {
  constructor(
    readonly code: "NO_TRANSACTIONS_FOUND" | "CURRENCY_MISMATCH",
    message: string,
    readonly detectedCurrency: string | null = null
  ) {
    super(message)
  }
}

async function runPdfImport(orgId: string, batchId: string) {
  try {
    const batch = getBatch(db, orgId, batchId)
    if (!batch?.filePath) throw new Error("Import file is missing")
    const file = dataPath(batch.filePath)
    const settings = getSettings(db, orgId)
    const llm = defaultLlm()
    if (!llm) throw new LlmError("LLM_UNAVAILABLE", "AI parsing is not configured")

    const info = await pdfInfo(file)
    if (info.encrypted) throw new PdfError("ENCRYPTED_PDF", "The PDF is password-protected")
    if (info.pages > env().MAX_PDF_PAGES) throw new PdfError("TOO_MANY_PAGES", `Statements are limited to ${env().MAX_PDF_PAGES} pages`)
    const pageTexts = await pdfPageTexts(file)

    // Every run counts towards the monthly quota, whether or not it succeeds.
    updateBatch(db, orgId, batchId, { llmCalled: true, attempts: batch.attempts + 1 })
    const e = env()
    const extraction = await extractStatement({
      llm,
      models: { text: e.LLM_TEXT_MODEL, vision: e.LLM_VISION_MODEL, escalation: e.LLM_ESCALATION_MODEL },
      pageTexts,
      renderImages: () => pdfPageImages(file, info.pages),
    })
    if (!extraction.rows.length) throw new ImportFailure("NO_TRANSACTIONS_FOUND", "No transactions were found in this PDF.")
    if (extraction.currency && extraction.currency !== settings.currency)
      throw new ImportFailure(
        "CURRENCY_MISMATCH",
        `This statement is in ${extraction.currency}, but your workspace uses ${settings.currency}.`,
        extraction.currency
      )

    stageRows(db, orgId, batchId, extraction.rows, {
      currency: settings.currency, // a different printed currency was refused above
      reconciliation: extraction.reconciliation,
      parser: extraction.parser,
      modelUsed: extraction.model,
    })
  } catch (error) {
    const code = error instanceof PdfError || error instanceof LlmError || error instanceof ImportFailure ? error.code : "INTERNAL"
    if (code === "INTERNAL") console.error(`[import ${batchId}]`, error)
    updateBatch(db, orgId, batchId, {
      status: "failed",
      errorCode: code,
      errorMessage: error instanceof Error ? error.message : String(error),
      ...(error instanceof ImportFailure && error.detectedCurrency ? { detectedCurrency: error.detectedCurrency } : {}),
    })
  }
}

/** Jobs live in memory: anything still "parsing" after a restart was interrupted. */
export function recoverInterruptedImports() {
  db.update(importBatches)
    .set({ status: "failed", errorCode: "INTERRUPTED", errorMessage: "Processing was interrupted by a restart. Please retry." })
    .where(eq(importBatches.status, "parsing"))
    .run()
}
