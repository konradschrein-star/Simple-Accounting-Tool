import { createHash } from "node:crypto"
import { eq } from "drizzle-orm"
import { beforeAll, describe, expect, it } from "vitest"
import type { Db } from "@/db/client"
import { transactions } from "@/db/schema"
import { getJurisdiction } from "@/jurisdictions"
import { listAccounts, updateTransactionDetails } from "@/server/repos/ledger"
import { transactionDetail } from "@/server/repos/transaction-detail"
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
      .values({
        orgId,
        date: "2026-08-03",
        description: "Miete August",
        counterparty: "Coworking Mitte GmbH",
        amountMinor: -119_000,
        ledgerAccountId: rent.id,
        reviewStatus: "ok",
        dedupeHash: createHash("sha256").update("r1").digest("hex"),
      })
      .returning()
      .get()
    const period = { from: "2026-07-01", to: "2026-09-30" }
    expect(vatSummary(db, orgId, de, getSettings(db, orgId), period).inputTaxMinor).toBe(0)

    createReceipt(db, orgId, { id: "rcpt1", filePath: "uploads/x.pdf", filename: "rechnung.pdf", mimeType: "application/pdf", sizeBytes: 1000 })
    recordExtraction(db, orgId, "rcpt1", { vendor: "Coworking Mitte GmbH", date: "2026-08-01", totalMinor: 119_000, vatMinor: 19_000, currency: "EUR" }, de)
    expect(getReceipt(db, orgId, "rcpt1")).toMatchObject({ readStatus: "read", transactionId: null, suggestedTransactionId: txn.id })

    expect(matchReceipt(db, orgId, "rcpt1", txn.id, de)).toEqual({ vatRateBp: 1900 })
    expect(listReceipts(db, orgId, "matched")[0].transaction?.id).toBe(txn.id)
    expect(vatSummary(db, orgId, de, getSettings(db, orgId), period).inputTaxMinor).toBe(19_000)

    unmatchReceipt(db, orgId, "rcpt1")
    expect(getReceipt(db, orgId, "rcpt1")).toMatchObject({ transactionId: null, appliedVatRateBp: null })
    expect(vatSummary(db, orgId, de, getSettings(db, orgId), period).inputTaxMinor).toBe(0)
  })

  it("never links across workspaces", () => {
    const a = bootstrapWorkspace(db, createUser(db), "A")
    const b = bootstrapWorkspace(db, createUser(db), "B")
    createReceipt(db, a, { id: "rcptA", filePath: "uploads/a.pdf", filename: "a.pdf", mimeType: "application/pdf", sizeBytes: 1 })
    const foreign = db
      .insert(transactions)
      .values({
        orgId: b,
        date: "2026-08-03",
        description: "x",
        counterparty: "",
        amountMinor: -100,
        reviewStatus: "ok",
        dedupeHash: createHash("sha256").update("r2").digest("hex"),
      })
      .returning()
      .get()
    expect(() => matchReceipt(db, a, "rcptA", foreign.id, getJurisdiction("de"))).toThrow(/Transaction not found/)
    expect(() => matchReceipt(db, b, "rcptA", foreign.id, getJurisdiction("de"))).toThrow(/Receipt not found/)
  })

  it("keeps one receipt per transaction and never undoes a rate the user set", () => {
    const orgId = bootstrapWorkspace(db, createUser(db), "Rates")
    applyJurisdiction(db, orgId, "de")
    const de = getJurisdiction("de")
    const txn = db
      .insert(transactions)
      .values({
        orgId,
        date: "2026-08-03",
        description: "Laptop",
        counterparty: "Apple",
        amountMinor: -119_000,
        reviewStatus: "ok",
        dedupeHash: createHash("sha256").update("r3").digest("hex"),
      })
      .returning()
      .get()
    const reading = { vendor: "Apple", date: "2026-08-03", totalMinor: 119_000, vatMinor: 19_000, currency: "EUR" }
    // Uploaded straight onto the transaction: reading it applies the rate.
    createReceipt(db, orgId, { id: "onTxn", filePath: "uploads/a.pdf", filename: "a.pdf", mimeType: "application/pdf", sizeBytes: 1, transactionId: txn.id })
    expect(() =>
      createReceipt(db, orgId, { id: "second", filePath: "uploads/b.pdf", filename: "b.pdf", mimeType: "application/pdf", sizeBytes: 1, transactionId: txn.id })
    ).toThrow(/already has a receipt/)
    recordExtraction(db, orgId, "onTxn", reading, de)
    expect(getReceipt(db, orgId, "onTxn")).toMatchObject({ readStatus: "read", transactionId: txn.id, appliedVatRateBp: 1900 })
    expect(transactionDetail(db, orgId, de, txn.id)?.vatRateBp).toBe(1900)

    // The user then overrides the rate; detaching the receipt must leave that choice alone.
    updateTransactionDetails(db, orgId, txn.id, { vatRateBp: 700 })
    unmatchReceipt(db, orgId, "onTxn")
    expect(transactionDetail(db, orgId, de, txn.id)?.vatRateBp).toBe(700)

    // A second receipt can now take the free transaction; a later reading of an attached receipt never moves it.
    createReceipt(db, orgId, { id: "other", filePath: "uploads/c.pdf", filename: "c.pdf", mimeType: "application/pdf", sizeBytes: 1 })
    recordExtraction(db, orgId, "other", reading, de)
    matchReceipt(db, orgId, "other", txn.id, de)
    expect(() => matchReceipt(db, orgId, "onTxn", txn.id, de)).toThrow(/already has a receipt/)
    expect(() => matchReceipt(db, orgId, "other", txn.id, de)).toThrow(/Detach/)
  })

  it("returns a receipt to the inbox when its transaction is deleted", () => {
    const orgId = bootstrapWorkspace(db, createUser(db), "Gone")
    const txn = db
      .insert(transactions)
      .values({
        orgId,
        date: "2026-08-03",
        description: "x",
        counterparty: "y",
        amountMinor: -500,
        reviewStatus: "ok",
        dedupeHash: createHash("sha256").update("r4").digest("hex"),
      })
      .returning()
      .get()
    createReceipt(db, orgId, { id: "orphan", filePath: "uploads/d.pdf", filename: "d.pdf", mimeType: "application/pdf", sizeBytes: 1, transactionId: txn.id })
    db.delete(transactions).where(eq(transactions.id, txn.id)).run()
    expect(listReceipts(db, orgId, "inbox").map((r) => [r.id, r.match])).toEqual([["orphan", "open"]])
  })
})
