import fs from "node:fs"
import path from "node:path"
import { beforeAll, describe, expect, it } from "vitest"
import type { Db } from "@/db/client"
import { startImport } from "@/ingest/service"
import { clientInputSchema, createClient } from "@/server/repos/clients"
import { listRows } from "@/server/repos/imports"
import { createDraft, finalizeDocument, getInvoice, saveDraft } from "@/server/repos/invoices"
import { commitBatch } from "@/server/repos/ledger"
import { applyJurisdiction, bootstrapWorkspace, getSettings, updateSettings } from "@/server/repos/workspace"
import { createUser, testDatabase } from "./helpers"

let db: Db
beforeAll(() => {
  db = testDatabase()
})

describe("structured statement import", () => {
  it("stages a CAMT.053 statement, reconciles it and matches the invoice named in the reference", () => {
    const orgId = bootstrapWorkspace(db, createUser(db), "Studio")
    applyJurisdiction(db, orgId, "de")
    updateSettings(db, orgId, { addressLine1: "Torstraße 1", postcode: "10119", city: "Berlin", taxNumber: "37/123/45678" })
    const clientId = createClient(
      db,
      orgId,
      clientInputSchema.parse({ name: "Bäckerei Müller GmbH", addressLine1: "Hauptstraße 5", postcode: "80331", city: "München" })
    ).id
    const id = createDraft(db, orgId, getSettings(db, orgId), "2026-09-20", { clientId })
    saveDraft(db, orgId, id, {
      clientId,
      currency: "EUR",
      issueDate: "2026-09-20",
      serviceDate: "2026-09-20",
      dueDate: "2026-10-04",
      notes: "",
      paymentTerms: "",
      stripePaymentLink: "",
      lines: [{ description: "Workshop", quantityMilli: 2500, unitPriceMinor: 100000, taxRateBp: 1900, discountBp: 0, unit: "" }],
    })
    expect(finalizeDocument(db, orgId, id, 1_000_000, "2026-09-20")).toBe("INV-2026-0001")

    const bytes = new Uint8Array(fs.readFileSync(path.join(__dirname, "../fixtures/structured/camt053-sparkasse.xml")))
    const batch = startImport({ orgId, jurisdiction: "de", currency: "EUR", today: "2026-11-01", filename: "statement.xml", bytes })
    expect(batch).toMatchObject({ source: "camt", parser: "camt", status: "staged", rowCount: 5, reconciliation: { ok: true } })
    const rows = listRows(db, orgId, batch.id)
    // 1,487.50 is a part payment of the 2,975.00 invoice — matched because the reference names it.
    expect(rows.find((r) => r.amountMinor === 148750)?.matchedInvoiceId).toBe(id)
    expect(rows.filter((r) => r.matchedInvoiceId)).toHaveLength(1)

    // Booking it records the part payment and takes over the closing balance as the known bank balance.
    commitBatch(db, orgId, batch.id)
    expect(getSettings(db, orgId)).toMatchObject({ bankBalanceMinor: 1_301_710, bankBalanceDate: "2026-10-25" })
    expect(getInvoice(db, orgId, id)).toMatchObject({ paidMinor: 148_750, invoice: { status: "finalized" } })
  })
})
