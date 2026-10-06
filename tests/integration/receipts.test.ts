import { createHash } from "node:crypto"
import { beforeAll, describe, expect, it } from "vitest"
import type { Db } from "@/db/client"
import { transactions } from "@/db/schema"
import { getJurisdiction } from "@/jurisdictions"
import { listAccounts } from "@/server/repos/ledger"
import { createReceipt, getReceipt, listReceipts, matchReceipt, recordExtraction, unmatchReceipt } from "@/server/repos/receipts"
import { vatSummary } from "@/server/repos/vat"
import { applyJurisdiction, bootstrapWorkspace, getSettings, updateSettings } from "@/server/repos/workspace"
import { createUser, testDatabase } from "./helpers"

let db: Db
beforeAll(() => {
  db = testDatabase()
})

describe("receipts", () => {
  it("suggests the payment, attaches it and drives the input-tax rate in the VAT return", () => {
    const orgId = bootstrapWorkspace(db, createUser(db), "Studio")
    applyJurisdiction(db, orgId, "de")
    updateSettings(db, orgId, { taxRegistered: true })
    const de = getJurisdiction("de")
    // A rent payment: the account default says no VAT (4210), but this landlord charges 19 %.
    const rent = listAccounts(db, orgId).find((a) => a.code === "4210")!
    const txn = db
      .insert(transactions)
      .values({ orgId, date: "2026-08-03", description: "Miete August", counterparty: "Coworking Mitte GmbH", amountMinor: -119_000, ledgerAccountId: rent.id, reviewStatus: "ok", dedupeHash: createHash("sha256").update("r1").digest("hex") })
      .returning()
      .get()
    const period = { from: "2026-07-01", to: "2026-09-30" }
    expect(vatSummary(db, orgId, de, getSettings(db, orgId), period).inputTaxMinor).toBe(0)

    createReceipt(db, orgId, { id: "rcpt1", filePath: "uploads/x.pdf", filename: "rechnung.pdf", mimeType: "application/pdf", sizeBytes: 1000 })
    recordExtraction(db, orgId, "rcpt1", { vendor: "Coworking Mitte GmbH", date: "2026-08-01", totalMinor: 119_000, vatMinor: 19_000, currency: "EUR" })
    expect(getReceipt(db, orgId, "rcpt1")).toMatchObject({ status: "suggested", suggestedTransactionId: txn.id })

    expect(matchReceipt(db, orgId, "rcpt1", txn.id, de.taxRatesBp)).toEqual({ vatRateBp: 1900 })
    expect(listReceipts(db, orgId, "matched")[0].transaction?.id).toBe(txn.id)
    expect(vatSummary(db, orgId, de, getSettings(db, orgId), period).inputTaxMinor).toBe(19_000)

    unmatchReceipt(db, orgId, "rcpt1")
    expect(getReceipt(db, orgId, "rcpt1")?.status).toBe("unmatched")
    expect(vatSummary(db, orgId, de, getSettings(db, orgId), period).inputTaxMinor).toBe(0)
  })

  it("never links across workspaces", () => {
    const a = bootstrapWorkspace(db, createUser(db), "A")
    const b = bootstrapWorkspace(db, createUser(db), "B")
    createReceipt(db, a, { id: "rcptA", filePath: "uploads/a.pdf", filename: "a.pdf", mimeType: "application/pdf", sizeBytes: 1 })
    const foreign = db
      .insert(transactions)
      .values({ orgId: b, date: "2026-08-03", description: "x", counterparty: "", amountMinor: -100, reviewStatus: "ok", dedupeHash: createHash("sha256").update("r2").digest("hex") })
      .returning()
      .get()
    expect(() => matchReceipt(db, a, "rcptA", foreign.id, [1900])).toThrow(/Transaction not found/)
    expect(() => matchReceipt(db, b, "rcptA", foreign.id, [1900])).toThrow(/Receipt not found/)
  })
})
