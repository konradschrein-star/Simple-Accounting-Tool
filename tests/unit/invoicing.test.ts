import { describe, expect, it } from "vitest"
import { displayStatus, finalizeBlockers, formatInvoiceNumber } from "@/invoicing/rules"
import { JURISDICTIONS, type TaxProfile } from "@/jurisdictions"
import { parseAmountInput, parseQuantityInput } from "@/lib/money"

const profile: TaxProfile = { taxRegistered: true, smallBusinessExempt: false, vatFilingFrequency: "quarterly", vatPeriodEndMonth: 3, deDauerfrist: false }
const seller = { name: "Acme", legalName: "", addressLine1: "Hauptstr. 1", addressLine2: "", postcode: "10115", city: "Berlin", country: "Germany", email: "", phone: "", website: "", taxNumber: "", vatId: "", bankIban: "", bankBic: "", ukSortCode: "", ukAccountNumber: "", usRoutingNumber: "" }
const client = { name: "Client GmbH", email: "", addressLine1: "Weg 2", addressLine2: "", postcode: "80331", city: "München", country: "Germany", vatId: "" }
const lines = [{ description: "Consulting", quantityMilli: 1000, unitPriceMinor: 10000, taxRateBp: 1900 }]

describe("invoice rules", () => {
  it("derives overdue from due date", () => {
    expect(displayStatus({ status: "finalized", dueDate: "2026-10-01" }, "2026-10-06")).toBe("overdue")
    expect(displayStatus({ status: "finalized", dueDate: "2026-10-06" }, "2026-10-06")).toBe("open")
    expect(displayStatus({ status: "paid", dueDate: "2026-10-01" }, "2026-10-06")).toBe("paid")
  })
  it("formats gap-free numbers", () => {
    expect(formatInvoiceNumber("INV-", 2026, 12)).toBe("INV-2026-0012")
  })
  it("blocks DE finalization without tax id and service date", () => {
    const blockers = finalizeBlockers({ jurisdiction: JURISDICTIONS.de, profile, seller, client, serviceDate: null, lines })
    expect(blockers.join(" ")).toMatch(/Steuernummer/)
    expect(blockers.join(" ")).toMatch(/Leistungsdatum/)
    expect(finalizeBlockers({ jurisdiction: JURISDICTIONS.de, profile, seller: { ...seller, taxNumber: "12/345/67890" }, client, serviceDate: "2026-10-01", lines })).toEqual([])
  })
  it("blocks USt on §19 invoices", () => {
    const blockers = finalizeBlockers({ jurisdiction: JURISDICTIONS.de, profile: { ...profile, smallBusinessExempt: true }, seller: { ...seller, taxNumber: "x" }, client, serviceDate: "2026-10-01", lines })
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
