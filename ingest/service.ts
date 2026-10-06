import "server-only"
import { createHash } from "node:crypto"
import fs from "node:fs"
import { and, eq, gte, isNull, notInArray, or, sum } from "drizzle-orm"
import { nanoid } from "nanoid"
import { db } from "@/db/client"
import { importBatches } from "@/db/schema"
import type { JurisdictionCode } from "@/jurisdictions/types"
import { dataPath } from "@/lib/data-path"
import { fromIso, monthKey } from "@/lib/dates"
import { env } from "@/lib/env"
import type { CurrencyCode } from "@/lib/money"
import { removeUpload, storeUpload } from "@/lib/storage"
import { createBatch, findBatchBySha, findMappingProfile, getBatch, saveMappingProfile, stageRows, updateBatch, type ImportBatch } from "@/server/repos/imports"
import { decodeCsv, detectCsv } from "./csv/detect"
import { normalizeRows } from "./csv/normalize"
import { parseStructured, sniffStructured, StructuredParseError, type StructuredFormat } from "./structured"
import type { CsvMapping } from "./csv/types"
import { enqueuePdfImport } from "./jobs"

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

/** What an import needs to know about the workspace it lands in. */
export type ImportContext = { orgId: string; jurisdiction: JurisdictionCode; currency: CurrencyCode }

export class ImportRejected extends Error {
  constructor(
    readonly code: string,
    readonly status: number
  ) {
    super(code)
  }
}

/** What an upload is, judged by content. Text formats carry their decoded text so it is decoded once. */
type Upload = { type: "pdf" } | { type: "csv" } | { type: StructuredFormat; text: string }

function sniff(bytes: Uint8Array, filename: string): Upload | null {
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return { type: "pdf" }
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes)
  const structured = sniffStructured(text)
  if (structured) return { type: structured, text }
  const head = text.slice(0, 4096)
  // Text with at least one delimiter and no NUL bytes — CSV/TSV/TXT exports.
  if (!head.includes("\u0000") && /[;,\t|]/.test(head) && /\.(csv|txt|tsv)$/i.test(filename)) return { type: "csv" }
  return null
}

/** LLM runs (first attempts and retries) this month — what the free-tier quota actually limits. */
export function pdfImportsThisMonth(orgId: string, today: string): number {
  return Number(
    db
      .select({ n: sum(importBatches.attempts) })
      .from(importBatches)
      .where(
        and(
          eq(importBatches.orgId, orgId),
          eq(importBatches.source, "pdf"),
          eq(importBatches.llmCalled, true),
          gte(importBatches.createdAt, fromIso(`${monthKey(today)}-01`)),
          or(isNull(importBatches.errorCode), notInArray(importBatches.errorCode, ["LLM_UNAVAILABLE", "PDF_TOOLING_UNAVAILABLE", "INTERRUPTED", "INTERNAL"]))
        )
      )
      .get()?.n ?? 0
  )
}

function readStoredCsv(batch: ImportBatch): string {
  return decodeCsv(new Uint8Array(fs.readFileSync(dataPath(batch.filePath!))))
}

function stageCsv(ctx: ImportContext, batch: ImportBatch, rows: string[][], mapping: CsvMapping) {
  stageRows(db, ctx.orgId, batch.id, normalizeRows(rows, mapping, ctx.currency), { parser: "csv", currency: ctx.currency })
}

/** Detects the CSV layout; stages immediately when a saved profile or a confident detection exists. */
function processCsv(ctx: ImportContext, batch: ImportBatch) {
  const detection = detectCsv(readStoredCsv(batch), ctx.jurisdiction)
  const saved = findMappingProfile(db, ctx.orgId, detection.fingerprint)
  const mapping = saved ?? detection.mapping
  updateBatch(db, ctx.orgId, batch.id, { parser: "csv", csvMapping: { ...mapping, fingerprint: detection.fingerprint } })
  if (saved || detection.confident) stageCsv(ctx, batch, detection.rows, mapping)
  else updateBatch(db, ctx.orgId, batch.id, { status: "needs_mapping" })
}

/**
 * CAMT/OFX carry exact data: stage directly. Like PDFs, a statement in another currency is refused rather than
 * booked as if it were in the workspace's.
 */
function processStructured(ctx: ImportContext, batch: ImportBatch, format: StructuredFormat, text: string) {
  const statement = parseStructured(format, text, ctx.currency)
  if (statement.currency && statement.currency !== ctx.currency)
    return updateBatch(db, ctx.orgId, batch.id, {
      status: "failed",
      parser: format,
      detectedCurrency: statement.currency,
      errorCode: "CURRENCY_MISMATCH",
      errorMessage: `This statement is in ${statement.currency}, but your workspace uses ${ctx.currency}.`,
    })
  if (!statement.rows.length) return updateBatch(db, ctx.orgId, batch.id, { status: "failed", parser: format, errorCode: "NO_TRANSACTIONS_FOUND" })
  stageRows(db, ctx.orgId, batch.id, statement.rows, { parser: format, currency: ctx.currency, reconciliation: statement.reconciliation })
}

/** Runs a synchronous parser; unreadable files are the user's problem to fix, anything else is a bug worth logging. */
function processSafely(ctx: ImportContext, batch: ImportBatch, label: string, work: () => void) {
  try {
    work()
  } catch (error) {
    const unreadable = error instanceof StructuredParseError
    if (!unreadable) console.error(`[import ${batch.id}]`, error)
    updateBatch(db, ctx.orgId, batch.id, {
      status: "failed",
      errorCode: unreadable ? "UNREADABLE_FILE" : "INTERNAL",
      errorMessage: `This ${label} file could not be read.`,
    })
  }
}

/**
 * Validates and stores an upload, then dispatches it. The file is written before the batch row exists,
 * so a failure can never leave a half-created batch that blocks re-uploading the same file.
 */
export function startImport(ctx: ImportContext & { today: string; filename: string; bytes: Uint8Array }): ImportBatch {
  const { orgId, bytes } = ctx
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new ImportRejected("FILE_TOO_LARGE", 413)
  const kind = sniff(bytes, ctx.filename)
  if (!kind) throw new ImportRejected("UNSUPPORTED_TYPE", 415)
  const sha = createHash("sha256").update(bytes).digest("hex")
  if (findBatchBySha(db, orgId, sha)) throw new ImportRejected("DUPLICATE_FILE", 409)
  if (kind.type === "pdf" && pdfImportsThisMonth(orgId, ctx.today) >= env().PDF_IMPORTS_PER_MONTH) throw new ImportRejected("QUOTA_EXCEEDED", 402)

  const id = nanoid()
  const filePath = storeUpload(orgId, "imports", id, kind.type, bytes)
  const batch = createBatch(db, orgId, { id, source: kind.type, filename: ctx.filename.slice(0, 200), fileSha256: sha, filePath })

  if (kind.type === "pdf") enqueuePdfImport(orgId, id)
  else if (kind.type === "csv") processSafely(ctx, batch, "CSV", () => processCsv(ctx, batch))
  else processSafely(ctx, batch, kind.type === "camt" ? "CAMT" : "OFX", () => processStructured(ctx, batch, kind.type, kind.text))
  return getBatch(db, orgId, id)!
}

/** Raw rows for the mapping editor preview. */
export function csvPreview(batch: ImportBatch, jurisdiction: JurisdictionCode) {
  const detection = detectCsv(readStoredCsv(batch), jurisdiction)
  return { header: detection.header, rows: detection.rows, dateFormatAmbiguous: detection.dateFormatAmbiguous }
}

/** Applies a user-confirmed mapping and remembers it for this bank's header layout. */
export function applyCsvMapping(ctx: ImportContext, batch: ImportBatch, mapping: CsvMapping) {
  const detection = detectCsv(readStoredCsv(batch), ctx.jurisdiction)
  saveMappingProfile(db, ctx.orgId, detection.fingerprint, mapping)
  updateBatch(db, ctx.orgId, batch.id, { csvMapping: { ...mapping, fingerprint: detection.fingerprint } })
  stageCsv(ctx, batch, detection.rows, mapping)
}

export function removeImportFile(batch: ImportBatch) {
  if (batch.filePath) removeUpload(batch.filePath)
}
