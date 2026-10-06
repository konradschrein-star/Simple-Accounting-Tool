import { describe, expect, it } from "vitest"
import { impliedVatRate, normalizeReceipt, suggestTransaction } from "@/bookkeeping/receipts"

describe("receipt extraction", () => {
  it("normalizes model output and rejects impossible values", () => {
    expect(normalizeReceipt({ vendor: " Adobe ", date: "2026-10-15", total: 66.45, tax: 10.61, currency: "eur", invoiceNumber: null })).toEqual({
      vendor: "Adobe",
      date: "2026-10-15",
      totalMinor: 6645,
      vatMinor: 1061,
      currency: "EUR",
      invoiceNumber: null,
    })
    const bad = normalizeReceipt({ vendor: "", date: "15.10.2026", total: 10, tax: 12, currency: "Euro", invoiceNumber: "" })
    expect(bad).toMatchObject({ vendor: null, date: null, vatMinor: null, currency: null })
  })

  it("infers the VAT rate and snaps it to the jurisdiction's rates", () => {
    expect(impliedVatRate(6645, 1061, [1900, 700, 0])).toBe(1900)
    expect(impliedVatRate(1070, 70, [1900, 700, 0])).toBe(700)
    expect(impliedVatRate(199, 32, [1900, 700, 0])).toBe(1900) // 32/167 = 19.16 % after rounding
    expect(impliedVatRate(5000, 0, [2000, 500, 0])).toBe(0)
    expect(impliedVatRate(12600, 1600, [1900, 700])).toBeNull() // mixed 19 % / 7 % receipt
    expect(impliedVatRate(null, 100, [1900])).toBeNull()
  })
})

describe("receipt ↔ payment matching", () => {
  const receipt = { vendor: "Adobe Systems Software", date: "2026-10-12", totalMinor: 6645, vatMinor: 1061, currency: "EUR" }
  const t = (id: string, date: string, amountMinor: number, counterparty = "", description = "") => ({ id, date, amountMinor, counterparty, description })

  it("needs the same amount going out", () => {
    expect(suggestTransaction(receipt, [t("in", "2026-10-12", 6645), t("other", "2026-10-12", -6600)])).toBeNull()
  })
  it("prefers the vendor in the booking text, then the closest date", () => {
    const pick = suggestTransaction(receipt, [t("near", "2026-10-13", -6645, "PAYPAL"), t("vendor", "2026-10-20", -6645, "ADOBE SYSTEMS")])
    expect(pick?.id).toBe("vendor")
    expect(suggestTransaction(receipt, [t("a", "2026-10-20", -6645), t("b", "2026-10-14", -6645)])?.id).toBe("b")
  })
  it("ignores payments far from the receipt date unless the vendor matches", () => {
    expect(suggestTransaction(receipt, [t("old", "2026-08-01", -6645)])).toBeNull()
    expect(suggestTransaction(receipt, [t("late", "2026-11-05", -6645, "Adobe")])?.id).toBe("late")
  })
})
