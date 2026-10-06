import { createHash } from "node:crypto"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import type { Db } from "@/db/client"
import { transactions } from "@/db/schema"
import { createClient } from "@/server/repos/clients"
import {
  cancelInvoice,
  convertQuote,
  createDraft,
  deleteDraft,
  finalizeDocument,
  findByPublicToken,
  getInvoice,
  listDocuments,
  recordPayment,
  removePayment,
  saveDraft,
  setQuoteOutcome,
} from "@/server/repos/invoices"
import { createSeries, getSeries, setSeriesPaused } from "@/server/repos/recurring"
import { runRecurringInvoices } from "@/server/services/invoicing"
import { applyJurisdiction, bootstrapWorkspace, getSettings, updateSettings } from "@/server/repos/workspace"
import { createUser, testDatabase } from "./helpers"

const ONE = 1_000_000
const TODAY = "2026-10-06"
let db: Db
let orgId: string
let clientId: string

beforeAll(() => {
  db = testDatabase()
})

beforeEach(() => {
  orgId = bootstrapWorkspace(db, createUser(db), "Acme")
  applyJurisdiction(db, orgId, "us")
  updateSettings(db, orgId, { addressLine1: "1 Main St", city: "Austin", postcode: "73301", country: "USA", timezone: "UTC" })
  clientId = createClient(db, orgId, { name: "Client Inc", email: "ap@client.test", addressLine1: "2 Side St", city: "Dallas" }).id
})

function document(kind: "invoice" | "quote", unitPriceMinor = 10_000, issueDate = "2026-10-01", dueDate = "2026-10-15") {
  const id = createDraft(db, orgId, getSettings(db, orgId), issueDate, { kind, clientId })
  saveDraft(db, orgId, id, {
    clientId,
    currency: "USD",
    issueDate,
    serviceDate: issueDate,
    dueDate,
    notes: "",
    paymentTerms: "",
    stripePaymentLink: "",
    lines: [{ description: "Work", quantityMilli: 2000, unitPriceMinor, taxRateBp: 0, discountBp: 0, unit: "h" }],
  })
  return id
}
const issued = (kind: "invoice" | "quote" = "invoice", price?: number) => {
  const id = document(kind, price)
  finalizeDocument(db, orgId, id, ONE, TODAY)
  return id
}

describe("document lifecycle", () => {
  it("numbers each kind in its own gap-free sequence and mints a share token", () => {
    const a = finalizeDocument(db, orgId, document("invoice"), ONE, TODAY)
    const q = finalizeDocument(db, orgId, document("quote"), ONE, TODAY)
    const b = finalizeDocument(db, orgId, document("invoice"), ONE, TODAY)
    expect([a, b, q]).toEqual(["INV-2026-0001", "INV-2026-0002", "QUO-2026-0001"])
    const invoice = listDocuments(db, orgId, "invoice")[0].invoice
    expect(invoice.publicToken).toHaveLength(32)
    expect(findByPublicToken(db, invoice.publicToken!)?.invoice.id).toBe(invoice.id)
    expect(findByPublicToken(db, "x".repeat(32))).toBeNull()
  })

  it("takes part payments, refuses overpayment and future dates, and removes single payments", () => {
    const id = issued()
    recordPayment(db, orgId, id, { date: "2026-10-05", amountMinor: 5_000, method: "manual" }, TODAY)
    expect(getInvoice(db, orgId, id)).toMatchObject({ paidMinor: 5_000, invoice: { status: "finalized" } })
    expect(() => recordPayment(db, orgId, id, { date: "2026-10-05", amountMinor: 15_001, method: "manual" }, TODAY)).toThrow(/more than is still open/)
    expect(() => recordPayment(db, orgId, id, { date: "2026-10-07", amountMinor: 100, method: "manual" }, TODAY)).toThrow(/future/)
    recordPayment(db, orgId, id, { date: "2026-10-06", amountMinor: 15_000, method: "manual" }, TODAY)
    const paid = getInvoice(db, orgId, id)!
    expect(paid).toMatchObject({ paidMinor: 20_000, invoice: { status: "paid", paidDate: "2026-10-06" } })
    expect(() => recordPayment(db, orgId, id, { date: TODAY, amountMinor: 1, method: "manual" }, TODAY)).toThrow(/can’t take a payment/)
    removePayment(db, orgId, paid.payments[1].id, TODAY)
    expect(getInvoice(db, orgId, id)).toMatchObject({ paidMinor: 5_000, invoice: { status: "finalized", paidDate: null } })
  })

  it("frees a bank line for re-matching when its payment is removed", () => {
    const id = issued()
    const txn = db
      .insert(transactions)
      .values({
        orgId,
        date: "2026-10-05",
        description: "pay",
        amountMinor: 20_000,
        invoiceId: id,
        reviewStatus: "ok",
        dedupeHash: createHash("sha256").update(orgId).digest("hex"),
      })
      .returning()
      .get()
    recordPayment(db, orgId, id, { date: "2026-10-05", amountMinor: 20_000, method: "bank", transactionId: txn.id }, TODAY)
    removePayment(db, orgId, getInvoice(db, orgId, id)!.payments[0].id, TODAY)
    expect(
      db
        .select()
        .from(transactions)
        .all()
        .find((t) => t.id === txn.id)?.invoiceId
    ).toBeNull()
  })

  it("cancels with a linked credit note, atomically", () => {
    const id = issued()
    const { creditNoteId, number } = cancelInvoice(db, orgId, id, TODAY, ONE)
    expect(number).toBe("CN-2026-0001")
    const original = getInvoice(db, orgId, id)!
    const credit = getInvoice(db, orgId, creditNoteId)!
    expect(original.invoice).toMatchObject({ status: "cancelled", relatedId: creditNoteId })
    expect(credit.invoice).toMatchObject({ kind: "credit_note", status: "finalized", totalMinor: -original.invoice.totalMinor, relatedId: id })
    expect(credit.invoice.snapshot?.relatedNumber).toBe(original.invoice.number)
    expect(() => cancelInvoice(db, orgId, id, TODAY, ONE)).toThrow()

    // When the credit note can't be issued (seller address removed), nothing is left behind.
    const other = issued()
    updateSettings(db, orgId, { addressLine1: "" })
    expect(() => cancelInvoice(db, orgId, other, TODAY, ONE)).toThrow()
    expect(getInvoice(db, orgId, other)?.invoice.status).toBe("finalized")
    expect(listDocuments(db, orgId, "credit_note")).toHaveLength(1)
  })

  it("lets clients answer only valid quotes; the owner can still decide and convert, once", () => {
    const quote = issued("quote", 25_000)
    setQuoteOutcome(db, orgId, quote, "accepted", "client", TODAY)
    expect(() => setQuoteOutcome(db, orgId, quote, "declined", "client", TODAY)).toThrow(/no longer be answered/)
    const expired = document("quote", 100, "2026-09-01", "2026-09-30")
    finalizeDocument(db, orgId, expired, ONE, "2026-09-01")
    expect(() => setQuoteOutcome(db, orgId, expired, "accepted", "client", TODAY)).toThrow(/no longer be answered/)
    setQuoteOutcome(db, orgId, expired, "accepted", "user", TODAY)

    const invoiceId = convertQuote(db, orgId, getSettings(db, orgId), TODAY, quote)
    expect(getInvoice(db, orgId, invoiceId)!.invoice).toMatchObject({ kind: "invoice", status: "draft", totalMinor: 50_000, relatedId: quote })
    expect(getInvoice(db, orgId, quote)!.invoice).toMatchObject({ status: "converted", relatedId: invoiceId })
    expect(() => convertQuote(db, orgId, getSettings(db, orgId), TODAY, quote)).toThrow()
  })

  it("rejects payments and cancellations on other workspaces' documents", () => {
    const id = issued()
    const intruder = bootstrapWorkspace(db, createUser(db), "Other")
    expect(() => recordPayment(db, intruder, id, { date: "2026-10-05", amountMinor: 100, method: "manual" }, TODAY)).toThrow()
    expect(() => cancelInvoice(db, intruder, id, TODAY, ONE)).toThrow()
  })
})

describe("recurring invoices", () => {
  const series = (startDate: string, totalCount: number | null) =>
    createSeries(db, orgId, getSettings(db, orgId), issued(), { frequency: "monthly", startDate, totalCount, autoSend: false }, startDate)

  it("keeps its template out of every list and protected from issuing or deleting", () => {
    const id = series("2026-11-01", null)
    const template = getSeries(db, orgId, id)!.templateInvoiceId
    expect(listDocuments(db, orgId, "invoice").map((r) => r.invoice.id)).not.toContain(template)
    expect(() => finalizeDocument(db, orgId, template, ONE, TODAY)).toThrow()
    expect(() => deleteDraft(db, orgId, template, TODAY)).toThrow()
  })

  it("catches up missed periods from the anchor and completes after the last one", async () => {
    const id = series("2026-07-31", 3)
    await runRecurringInvoices(db)
    const generated = listDocuments(db, orgId, "invoice")
      .map((r) => r.invoice)
      .filter((i) => i.recurringSeriesId === id)
    expect(generated.map((i) => i.issueDate).sort()).toEqual(["2026-07-31", "2026-08-31", "2026-09-30"])
    expect(generated.every((i) => i.status === "finalized")).toBe(true)
    expect(getSeries(db, orgId, id)).toMatchObject({ generatedCount: 3, state: "completed", nextIssueDate: "2026-10-31" })
    await runRecurringInvoices(db)
    expect(listDocuments(db, orgId, "invoice").filter((r) => r.invoice.recurringSeriesId === id)).toHaveLength(3)
  })

  it("resumes from today instead of back-billing a burst of missed invoices", () => {
    const id = series("2026-05-15", null)
    setSeriesPaused(db, orgId, id, true, "2026-05-15")
    setSeriesPaused(db, orgId, id, false, TODAY)
    expect(getSeries(db, orgId, id)).toMatchObject({ state: "active", nextIssueDate: "2026-10-15", generatedCount: 5 })
  })

  it("stops a series whose template can't be issued, says why, and leaves no half-made invoice", async () => {
    const id = series("2026-09-01", null)
    updateSettings(db, orgId, { addressLine1: "" })
    const before = listDocuments(db, orgId, "invoice").length
    await runRecurringInvoices(db)
    expect(getSeries(db, orgId, id)).toMatchObject({ state: "failed", generatedCount: 0 })
    expect(getSeries(db, orgId, id)?.lastError).toMatch(/address/i)
    expect(listDocuments(db, orgId, "invoice")).toHaveLength(before)
  })
})
