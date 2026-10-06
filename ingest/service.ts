import "server-only"
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { and, count, eq, gte, isNull, notInArray, or } from "drizzle-orm"
import { db } from "@/db/client"
import { importBatches } from "@/db/schema"
import type { JurisdictionCode } from "@/jurisdictions/types"
import { fromIso } from "@/lib/dates"
import { env } from "@/lib/env"
import { createBatch, findBatchBySha, findMappingProfile, getBatch, saveMappingProfile, stageRows, updateBatch, type ImportBatch } from "@/server/repos/imports"
import { decodeCsv, detectCsv } from "./csv/detect"
import { normalizeRows } from "./csv/normalize"
import type { CsvMapping } from "./csv/types"
import { enqueuePdfImport } from "./jobs"

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

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

export function pdfImportsThisMonth(orgId: string, today: string): number {
  const monthStart = fromIso(`${today.slice(0, 7)}-01`)
  return (
    db
      .select({ n: count() })
      .from(importBatches)
      .where(
        and(
          eq(importBatches.orgId, orgId),
          eq(importBatches.source, "pdf"),
          eq(importBatches.llmCalled, true),
          gte(importBatches.createdAt, monthStart),
          or(isNull(importBatches.errorCode), notInArray(importBatches.errorCode, ["LLM_UNAVAILABLE", "INTERRUPTED"])),
        ),
      )
      .get()?.n ?? 0
  )
}

function readStoredCsv(batch: ImportBatch): string {
  return decodeCsv(new Uint8Array(fs.readFileSync(path.join(path.resolve(env().DATA_DIR), batch.filePath!))))
}

/** Detects the CSV layout; stages immediately when a saved profile or a confident detection exists. */
function processCsv(orgId: string, batch: ImportBatch, jurisdiction: JurisdictionCode) {
  const detection = detectCsv(readStoredCsv(batch), jurisdiction)
  const saved = findMappingProfile(db, orgId, detection.fingerprint)
  const mapping = saved ?? detection.mapping
  updateBatch(db, orgId, batch.id, { parser: "csv", csvMapping: { ...mapping, fingerprint: detection.fingerprint } })
  if (saved || detection.confident) stageRows(db, orgId, batch.id, normalizeRows(detection.rows, mapping), { parser: "csv" })
  else updateBatch(db, orgId, batch.id, { status: "needs_mapping" })
}

export function startImport(input: { orgId: string; userId: string; jurisdiction: JurisdictionCode; today: string; filename: string; bytes: Uint8Array }): ImportBatch {
  const { orgId, bytes } = input
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new ImportRejected("FILE_TOO_LARGE", 413)
  const kind = sniff(bytes, input.filename)
  if (!kind) throw new ImportRejected("UNSUPPORTED_TYPE", 415)
  const sha = createHash("sha256").update(bytes).digest("hex")
  if (findBatchBySha(db, orgId, sha)) throw new ImportRejected("DUPLICATE_FILE", 409)
  if (kind === "pdf" && pdfImportsThisMonth(orgId, input.today) >= env().PDF_IMPORTS_PER_MONTH) throw new ImportRejected("QUOTA_EXCEEDED", 402)

  const batch = createBatch(db, { orgId, source: kind, filename: input.filename.slice(0, 200), fileSha256: sha })
  const relative = path.join("uploads", orgId, "imports", `${batch.id}.${kind}`)
  const absolute = path.join(path.resolve(env().DATA_DIR), relative)
  fs.mkdirSync(path.dirname(absolute), { recursive: true })
  fs.writeFileSync(absolute, bytes)
  updateBatch(db, orgId, batch.id, { filePath: relative })
  const stored = { ...batch, filePath: relative }

  if (kind === "csv") processCsv(orgId, stored, input.jurisdiction)
  else enqueuePdfImport(orgId, batch.id)
  return getBatch(db, orgId, batch.id)!
}

/** Re-reads raw rows for the mapping editor preview. */
export function csvPreview(batch: ImportBatch, jurisdiction: JurisdictionCode) {
  const detection = detectCsv(readStoredCsv(batch), jurisdiction)
  return { header: detection.header, rows: detection.rows, dateFormatAmbiguous: detection.dateFormatAmbiguous }
}

export function applyCsvMapping(orgId: string, batch: ImportBatch, jurisdiction: JurisdictionCode, mapping: CsvMapping) {
  const detection = detectCsv(readStoredCsv(batch), jurisdiction)
  saveMappingProfile(db, orgId, detection.fingerprint, mapping)
  updateBatch(db, orgId, batch.id, { csvMapping: { ...mapping, fingerprint: detection.fingerprint } })
  stageRows(db, orgId, batch.id, normalizeRows(detection.rows, mapping), { parser: "csv" })
}

export function removeImportFile(batch: ImportBatch) {
  if (batch.filePath) fs.rmSync(path.join(path.resolve(env().DATA_DIR), batch.filePath), { force: true })
}
