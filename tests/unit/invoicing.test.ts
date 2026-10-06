import { describe, expect, it } from "vitest"
import { displayStatus, dueReminderLevel, formatDocumentNumber, nextRecurrence, openAmount, reversalLines } from "@/invoicing/documents"
import { finalizeBlockers } from "@/invoicing/rules"
import { JURISDICTIONS, type TaxProfile } from "@/jurisdictions"
import { computeTotals, lineNetMinor, parseAmountInput, parseQuantityInput, toBaseMinor } from "@/lib/money"

const profile: TaxProfile = { taxRegistered: true, smallBusinessExempt: false, vatFilingFrequency: "quarterly", vatPeriodEndMonth: 3, deDauerfrist: false }
const seller = {
  name: "Acme",
  legalName: "",
  addressLine1: "Hauptstr. 1",
  addressLine2: "",
  postcode: "10115",
  city: "Berlin",
  country: "Germany",
  email: "",
  phone: "",
  website: "",
  taxNumber: "",
  vatId: "",
  bankIban: "",
  bankBic: "",
  ukSortCode: "",
  ukAccountNumber: "",
  usRoutingNumber: "",
}
const client = { name: "Client GmbH", email: "", addressLine1: "Weg 2", addressLine2: "", postcode: "80331", city: "München", country: "Germany", vatId: "" }
const lines = [{ description: "Consulting", quantityMilli: 1000, unitPriceMinor: 10000, taxRateBp: 1900 }]

describe("invoice rules", () => {
  it("formats gap-free numbers", () => {
    expect(formatDocumentNumber("INV-", 2026, 12)).toBe("INV-2026-0012")
  })
  it("quotes skip the jurisdiction's invoice requirements", () => {
    expect(finalizeBlockers({ kind: "quote", jurisdiction: JURISDICTIONS.de, profile, seller, client, serviceDate: null, lines })).toEqual([])
  })
  it("blocks DE finalization without tax id and service date", () => {
    const blockers = finalizeBlockers({ jurisdiction: JURISDICTIONS.de, profile, seller, client, serviceDate: null, lines })
    expect(blockers.join(" ")).toMatch(/Steuernummer/)
    expect(blockers.join(" ")).toMatch(/Leistungsdatum/)
    expect(
      finalizeBlockers({ jurisdiction: JURISDICTIONS.de, profile, seller: { ...seller, taxNumber: "12/345/67890" }, client, serviceDate: "2026-10-01", lines })
    ).toEqual([])
  })
  it("blocks USt on §19 invoices", () => {
    const blockers = finalizeBlockers({
      jurisdiction: JURISDICTIONS.de,
      profile: { ...profile, smallBusinessExempt: true },
      seller: { ...seller, taxNumber: "x" },
      client,
      serviceDate: "2026-10-01",
      lines,
    })
    expect(blockers).toContain("§19 UStG invoices cannot charge USt.")
  })
  it("US invoices only need addresses", () => {
    expect(finalizeBlockers({ jurisdiction: JURISDICTIONS.us, profile, seller, client, serviceDate: null, lines })).toEqual([])
  })
})

describe("lenient number input", () => {
  it.each([
    ["1.234,56", 123456],
    ["1,234.56", 123456],
    ["12,5", 1250],
    ["12.50", 1250],
    ["1000", 100000],
    ["-45,00", -4500],
  ])("amount %s", (input, expected) => expect(parseAmountInput(input)).toBe(expected))
  it.each([
    ["1", 1000],
    ["1,5", 1500],
    ["2.25", 2250],
    ["0.125", 125],
  ])("quantity %s", (input, expected) => expect(parseQuantityInput(input)).toBe(expected))
})

describe("document lifecycle", () => {
  const doc = (kind: "invoice" | "quote" | "credit_note", status: Parameters<typeof displayStatus>[0]["status"], dueDate = "2026-10-10") => ({
    kind,
    status,
    dueDate,
    totalMinor: 10000,
  })
  const TODAY = "2026-10-06"

  it("derives invoice status from due date and payments", () => {
    expect(displayStatus(doc("invoice", "finalized", "2026-10-01"), TODAY)).toBe("overdue")
    expect(displayStatus(doc("invoice", "finalized", TODAY), TODAY)).toBe("open")
    expect(displayStatus(doc("invoice", "finalized"), TODAY, 4000)).toBe("partial")
    expect(displayStatus(doc("invoice", "paid", "2026-10-01"), TODAY)).toBe("paid")
    expect(displayStatus(doc("invoice", "cancelled"), TODAY)).toBe("cancelled")
    expect(displayStatus(doc("invoice", "draft"), TODAY)).toBe("draft")
  })
  it("derives quote and credit note status", () => {
    expect(displayStatus(doc("quote", "finalized"), TODAY)).toBe("sent")
    expect(displayStatus(doc("quote", "finalized", "2026-10-01"), TODAY)).toBe("expired")
    expect(displayStatus(doc("quote", "accepted", "2026-10-01"), TODAY)).toBe("accepted")
    expect(displayStatus(doc("quote", "converted"), TODAY)).toBe("converted")
    expect(displayStatus(doc("credit_note", "finalized"), TODAY)).toBe("issued")
  })
  it("reverses lines for a cancellation credit note so totals negate exactly", () => {
    const original = [
      { description: "A", quantityMilli: 2500, unitPriceMinor: 3333, taxRateBp: 1900, discountBp: 1000 },
      { description: "B", quantityMilli: 1000, unitPriceMinor: 9999, taxRateBp: 700 },
    ]
    const a = computeTotals(original)
    const b = computeTotals(reversalLines(original))
    expect(b.totalMinor).toBe(-a.totalMinor)
    expect(b.taxMinor).toBe(-a.taxMinor)
  })
  it("applies line discounts with a single rounding", () => {
    expect(lineNetMinor(3000, 1999, 1500)).toBe(5097) // 3 × 19.99 × 0.85 = 50.9745
    expect(lineNetMinor(1000, 10000)).toBe(10000)
    expect(openAmount(10000, 12000)).toBe(0)
    expect(toBaseMinor(10000, 1_170_000)).toBe(11700)
  })
  it("schedules recurrences from the anchor, clamping short months without drifting", () => {
    expect(nextRecurrence("2026-01-31", "monthly", 1)).toBe("2026-02-28")
    expect(nextRecurrence("2026-01-31", "monthly", 2)).toBe("2026-03-31")
    expect(nextRecurrence("2026-01-31", "quarterly", 1)).toBe("2026-04-30")
    expect(nextRecurrence("2024-02-29", "yearly", 1)).toBe("2025-02-28")
    expect(nextRecurrence("2026-12-28", "weekly", 1)).toBe("2027-01-04")
  })
  it("sends the highest reminder level reached, never the same one twice", () => {
    const schedule = [7, 21, 35]
    expect(dueReminderLevel("2026-10-01", "2026-10-06", schedule, 0)).toBeNull()
    expect(dueReminderLevel("2026-09-29", "2026-10-06", schedule, 0)).toBe(1)
    expect(dueReminderLevel("2026-09-29", "2026-10-06", schedule, 1)).toBeNull()
    expect(dueReminderLevel("2026-09-01", "2026-10-06", schedule, 1)).toBe(3)
  })
})
