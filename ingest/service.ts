import "server-only"
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { and, eq, gte, isNull, notInArray, or, sum } from "drizzle-orm"
import { nanoid } from "nanoid"
import { db } from "@/db/client"
import { importBatches } from "@/db/schema"
import type { JurisdictionCode } from "@/jurisdictions/types"
import { dataPath } from "@/lib/data-path"
import { fromIso, monthKey } from "@/lib/dates"
import { env } from "@/lib/env"
import { createBatch, findBatchBySha, findMappingProfile, getBatch, saveMappingProfile, stageRows, updateBatch, type ImportBatch } from "@/server/repos/imports"
import { decodeCsv, detectCsv } from "./csv/detect"
import { normalizeRows } from "./csv/normalize"
import type { CsvMapping } from "./csv/types"
import { enqueuePdfImport } from "./jobs"

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

/** What an import needs to know about the workspace it lands in. */
export type ImportContext = { orgId: string; jurisdiction: JurisdictionCode; currency: string }

export class ImportRejected extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code)
  }
}

function sniff(bytes: Uint8Array, filename: string): "pdf" | "csv" | null {
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "pdf"
  const head = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, 4096))
  // Text with at least one delimiter and no NUL bytes — CSV/TSV/TXT exports.
  if (!head.includes("\u0000") && /[;,\t|]/.test(head) && /\.(csv|txt|tsv)$/i.test(filename)) return "csv"
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
          or(isNull(importBatches.errorCode), notInArray(importBatches.errorCode, ["LLM_UNAVAILABLE", "PDF_TOOLING_UNAVAILABLE", "INTERRUPTED", "INTERNAL"])),
        ),
      )
      .get()?.n ?? 0,
  )
}

function readStoredCsv(batch: ImportBatch): string {
  return decodeCsv(new Uint8Array(fs.readFileSync(dataPath(batch.filePath!))))
}

function stageCsv(ctx: ImportContext, batch: ImportBatch, rows: string[][], mapping: CsvMapping) {
  stageRows(db, ctx.orgId, batch.id, normalizeRows(rows, mapping, ctx.currency), { parser: "csv" })
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
  if (kind === "pdf" && pdfImportsThisMonth(orgId, ctx.today) >= env().PDF_IMPORTS_PER_MONTH) throw new ImportRejected("QUOTA_EXCEEDED", 402)

  const id = nanoid()
  const filePath = path.join("uploads", orgId, "imports", `${id}.${kind}`)
  fs.mkdirSync(path.dirname(dataPath(filePath)), { recursive: true })
  fs.writeFileSync(dataPath(filePath), bytes)
  const batch = createBatch(db, orgId, { id, source: kind, filename: ctx.filename.slice(0, 200), fileSha256: sha, filePath })

  if (kind === "pdf") enqueuePdfImport(orgId, id)
  else {
    try {
      processCsv(ctx, batch)
    } catch (error) {
      console.error(`[import ${id}]`, error)
      updateBatch(db, orgId, id, { status: "failed", errorCode: "INTERNAL", errorMessage: "This CSV could not be read." })
    }
  }
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
  if (batch.filePath) fs.rmSync(dataPath(batch.filePath), { force: true })
}
