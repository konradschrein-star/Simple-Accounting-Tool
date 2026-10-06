import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import type { Db } from "@/db/client"
import { runRecurringInvoices } from "@/invoicing/service"
import { getJurisdiction } from "@/jurisdictions"
import { createClient } from "@/server/repos/clients"
import {
  cancelInvoice,
  clearPayments,
  convertQuote,
  createDraft,
  finalizeDocument,
  findByPublicToken,
  getInvoice,
  listDocuments,
  recordPayment,
  saveDraft,
  setQuoteOutcome,
} from "@/server/repos/invoices"
import { createSeries, getSeries } from "@/server/repos/recurring"
import { applyJurisdiction, bootstrapWorkspace, getSettings, updateSettings } from "@/server/repos/workspace"
import { createUser, testDatabase } from "./helpers"

const US = getJurisdiction("us")
const ONE = 1_000_000
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

function document(kind: "invoice" | "quote", unitPriceMinor = 10_000, issueDate = "2026-10-01") {
  const settings = getSettings(db, orgId)
  const id = createDraft(db, orgId, settings, issueDate, { kind, clientId })
  saveDraft(db, orgId, id, {
    clientId,
    currency: "USD",
    issueDate,
    serviceDate: issueDate,
    dueDate: "2026-10-15",
    notes: "",
    paymentTerms: "",
    stripePaymentLink: "",
    lines: [{ description: "Work", quantityMilli: 2000, unitPriceMinor, taxRateBp: 0, discountBp: 0, unit: "h" }],
  })
  return id
}

describe("document lifecycle", () => {
  it("numbers each kind in its own gap-free sequence and mints a public token", () => {
    const a = finalizeDocument(db, orgId, US, document("invoice"), ONE)
    const q = finalizeDocument(db, orgId, US, document("quote"), ONE)
    const b = finalizeDocument(db, orgId, US, document("invoice"), ONE)
    expect([a, b, q]).toEqual(["INV-2026-0001", "INV-2026-0002", "QUO-2026-0001"])
    const invoice = listDocuments(db, orgId, "invoice")[0].invoice
    expect(invoice.publicToken).toHaveLength(32)
    expect(findByPublicToken(db, invoice.publicToken!)?.invoice.id).toBe(invoice.id)
    expect(findByPublicToken(db, "x".repeat(32))).toBeNull()
  })

  it("tracks part payments and flips to paid once covered", () => {
    const id = document("invoice")
    finalizeDocument(db, orgId, US, id, ONE)
    recordPayment(db, orgId, id, { date: "2026-10-05", amountMinor: 5_000, method: "manual" })
    expect(getInvoice(db, orgId, id)).toMatchObject({ paidMinor: 5_000, invoice: { status: "finalized" } })
    recordPayment(db, orgId, id, { date: "2026-10-09", amountMinor: 15_000, method: "manual" })
    expect(getInvoice(db, orgId, id)).toMatchObject({ paidMinor: 20_000, invoice: { status: "paid", paidDate: "2026-10-09" } })
    expect(() => recordPayment(db, orgId, id, { date: "2026-10-10", amountMinor: 1, method: "manual" })).toThrow(/open invoices/)
    clearPayments(db, orgId, id)
    expect(getInvoice(db, orgId, id)).toMatchObject({ paidMinor: 0, invoice: { status: "finalized", paidDate: null } })
  })

  it("cancels with a linked credit note that reverses the total", () => {
    const id = document("invoice")
    finalizeDocument(db, orgId, US, id, ONE)
    const { creditNoteId, number } = cancelInvoice(db, orgId, US, id, "2026-10-06", ONE)
    expect(number).toBe("CN-2026-0001")
    const original = getInvoice(db, orgId, id)!
    const credit = getInvoice(db, orgId, creditNoteId)!
    expect(original.invoice).toMatchObject({ status: "cancelled", relatedId: creditNoteId })
    expect(credit.invoice).toMatchObject({ kind: "credit_note", status: "finalized", totalMinor: -original.invoice.totalMinor, relatedId: id })
    expect(credit.invoice.snapshot?.relatedNumber).toBe(original.invoice.number)
    expect(() => cancelInvoice(db, orgId, US, id, "2026-10-06", ONE)).toThrow()
  })

  it("converts an accepted quote into an invoice draft, once", () => {
    const quote = document("quote", 25_000)
    finalizeDocument(db, orgId, US, quote, ONE)
    setQuoteOutcome(db, orgId, quote, "accepted")
    const invoiceId = convertQuote(db, orgId, getSettings(db, orgId), "2026-10-06", quote)
    expect(getInvoice(db, orgId, invoiceId)!.invoice).toMatchObject({ kind: "invoice", status: "draft", totalMinor: 50_000, relatedId: quote })
    expect(getInvoice(db, orgId, quote)!.invoice).toMatchObject({ status: "converted", relatedId: invoiceId })
    expect(() => convertQuote(db, orgId, getSettings(db, orgId), "2026-10-06", quote)).toThrow()
  })

  it("rejects payments and cancellations on other workspaces' documents", () => {
    const id = document("invoice")
    finalizeDocument(db, orgId, US, id, ONE)
    const intruder = bootstrapWorkspace(db, createUser(db), "Other")
    expect(() => recordPayment(db, intruder, id, { date: "2026-10-05", amountMinor: 100, method: "manual" })).toThrow()
    expect(() => cancelInvoice(db, intruder, US, id, "2026-10-06", ONE)).toThrow()
  })
})

describe("recurring invoices", () => {
  it("catches up missed periods from the anchor and stops after the last one", async () => {
    const template = document("invoice")
    const seriesId = createSeries(db, orgId, {
      templateInvoiceId: template,
      frequency: "monthly",
      nextIssueDate: "2026-07-31",
      endDate: null,
      remaining: 3,
      autoSend: false,
    })
    // Templates never show up as documents of their own.
    expect(listDocuments(db, orgId, "invoice")).toHaveLength(0)
    await runRecurringInvoices(db)
    const generated = listDocuments(db, orgId, "invoice").map((r) => r.invoice)
    expect(generated.map((i) => i.issueDate).sort()).toEqual(["2026-07-31", "2026-08-31", "2026-09-30"])
    expect(generated.every((i) => i.status === "finalized" && i.recurringSeriesId === seriesId)).toBe(true)
    expect(getSeries(db, orgId, seriesId)).toMatchObject({ generatedCount: 3, remaining: 0, active: false, nextIssueDate: "2026-10-31" })
    await runRecurringInvoices(db)
    expect(listDocuments(db, orgId, "invoice")).toHaveLength(3)
  })

  it("pauses a series whose template can no longer be finalized", async () => {
    const template = document("invoice")
    updateSettings(db, orgId, { addressLine1: "" }) // seller address is required
    const seriesId = createSeries(db, orgId, {
      templateInvoiceId: template,
      frequency: "weekly",
      nextIssueDate: "2026-09-01",
      endDate: null,
      remaining: null,
      autoSend: false,
    })
    await runRecurringInvoices(db)
    expect(getSeries(db, orgId, seriesId)).toMatchObject({ active: false, generatedCount: 0 })
    expect(listDocuments(db, orgId, "invoice")).toHaveLength(0) // the half-made draft is cleaned up
  })
})
