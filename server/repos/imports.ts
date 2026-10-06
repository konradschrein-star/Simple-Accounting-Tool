import { and, asc, desc, eq, inArray } from "drizzle-orm"
import type { Db } from "@/db/client"
import { csvMappingProfiles, importBatches, importRows, invoices, transactions, type Reconciliation, type RowIssue } from "@/db/schema"
import type { CsvMapping, NormalizedRow } from "@/ingest/csv/types"
import { hashBankRows } from "@/ingest/dedupe"
import { DomainError } from "@/lib/action-result"

export type ImportBatch = typeof importBatches.$inferSelect
export type ImportRow = typeof importRows.$inferSelect

export class ImportError extends DomainError {}

export function listBatches(db: Db, orgId: string) {
  return db.select().from(importBatches).where(eq(importBatches.orgId, orgId)).orderBy(desc(importBatches.createdAt)).all()
}

export function getBatch(db: Db, orgId: string, id: string): ImportBatch | null {
  return db.select().from(importBatches).where(and(eq(importBatches.orgId, orgId), eq(importBatches.id, id))).get() ?? null
}

export function findBatchBySha(db: Db, orgId: string, sha: string): ImportBatch | null {
  return db.select().from(importBatches).where(and(eq(importBatches.orgId, orgId), eq(importBatches.fileSha256, sha))).get() ?? null
}

export function createBatch(db: Db, orgId: string, values: Omit<typeof importBatches.$inferInsert, "orgId">): ImportBatch {
  return db.insert(importBatches).values({ ...values, orgId }).returning().get()
}

export function updateBatch(db: Db, orgId: string, id: string, patch: Partial<typeof importBatches.$inferInsert>) {
  db.update(importBatches).set(patch).where(and(eq(importBatches.orgId, orgId), eq(importBatches.id, id))).run()
}

export function listRows(db: Db, orgId: string, batchId: string): ImportRow[] {
  if (!getBatch(db, orgId, batchId)) return []
  return db.select().from(importRows).where(eq(importRows.batchId, batchId)).orderBy(asc(importRows.rowIndex)).all()
}

export function findMappingProfile(db: Db, orgId: string, fingerprint: string): CsvMapping | null {
  const profile = db
    .select({ mapping: csvMappingProfiles.mapping })
    .from(csvMappingProfiles)
    .where(and(eq(csvMappingProfiles.orgId, orgId), eq(csvMappingProfiles.headerFingerprint, fingerprint)))
    .get()
  return profile?.mapping ?? null
}

export function saveMappingProfile(db: Db, orgId: string, fingerprint: string, mapping: CsvMapping) {
  db.insert(csvMappingProfiles)
    .values({ orgId, headerFingerprint: fingerprint, mapping })
    .onConflictDoUpdate({ target: [csvMappingProfiles.orgId, csvMappingProfiles.headerFingerprint], set: { mapping } })
    .run()
}

/**
 * Writes parsed rows to staging with review flags: duplicates of already-booked lines are excluded by default,
 * and credits that exactly match an open invoice get a "mark as paid" suggestion. One short sync transaction.
 */
export function stageRows(
  db: Db,
  orgId: string,
  batchId: string,
  rows: NormalizedRow[],
  extra: { reconciliation?: Reconciliation | null; status?: ImportBatch["status"]; parser?: ImportBatch["parser"]; modelUsed?: string | null } = {},
) {
  if (!getBatch(db, orgId, batchId)) throw new ImportError("Import not found")
  const hashByRow = hashBankRows(rows)
  const hashes = [...hashByRow.values()]
  const existing = new Set(
    hashes.length
      ? db
          .select({ h: transactions.dedupeHash })
          .from(transactions)
          .where(and(eq(transactions.orgId, orgId), inArray(transactions.dedupeHash, hashes)))
          .all()
          .map((r) => r.h)
      : [],
  )
  const openInvoices = db
    .select({ id: invoices.id, total: invoices.totalMinor, issueDate: invoices.issueDate })
    .from(invoices)
    .where(and(eq(invoices.orgId, orgId), eq(invoices.status, "finalized")))
    .all()
  const claimed = new Set<string>()

  db.transaction((tx) => {
    tx.delete(importRows).where(eq(importRows.batchId, batchId)).run()
    for (const row of rows) {
      const issues: RowIssue[] = [...row.issues]
      const hash = hashByRow.get(row)
      const duplicate = hash ? existing.has(hash) : false
      if (duplicate) issues.push("possible_duplicate")
      const match =
        row.amountMinor && row.amountMinor > 0 && row.date
          ? openInvoices.find((inv) => !claimed.has(inv.id) && inv.total === row.amountMinor && inv.issueDate <= row.date!)
          : undefined
      if (match) claimed.add(match.id)
      tx.insert(importRows)
        .values({
          batchId,
          rowIndex: row.rowIndex,
          date: row.date,
          description: row.description,
          counterparty: row.counterparty,
          amountMinor: row.amountMinor,
          balanceMinor: row.balanceMinor,
          raw: row.raw,
          issues,
          include: !duplicate && issues.every((i) => i !== "unparseable_date" && i !== "unparseable_amount"),
          matchedInvoiceId: match?.id ?? null,
        })
        .run()
    }
    tx.update(importBatches)
      .set({ status: extra.status ?? "staged", rowCount: rows.length, reconciliation: extra.reconciliation ?? null, parser: extra.parser, modelUsed: extra.modelUsed })
      .where(and(eq(importBatches.orgId, orgId), eq(importBatches.id, batchId)))
      .run()
  })
}

/** Users can only edit the parsed values or drop the suggested invoice match — never point a row at an arbitrary invoice. */
export type RowEdit = { id: string; date?: string; description?: string; amountMinor?: number; include?: boolean; matchedInvoiceId?: null }

export function editRows(db: Db, orgId: string, batchId: string, edits: RowEdit[]) {
  const batch = getBatch(db, orgId, batchId)
  if (!batch || batch.status !== "staged") throw new ImportError("This import can no longer be edited")
  db.transaction((tx) => {
    for (const { id, ...patch } of edits) {
      tx.update(importRows).set(patch).where(and(eq(importRows.batchId, batchId), eq(importRows.id, id))).run()
    }
  })
}

export function deleteBatch(db: Db, orgId: string, id: string) {
  db.delete(importBatches).where(and(eq(importBatches.orgId, orgId), eq(importBatches.id, id))).run()
}
