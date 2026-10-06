import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { parseCamt, parseOfx, sniffStructured } from "@/ingest/structured"
import { matchPayment, referencesNumber } from "@/invoicing/matching"

const fixture = (name: string) => fs.readFileSync(path.join(__dirname, "../fixtures/structured", name), "utf8")

describe("CAMT.053", () => {
  const xml = fixture("camt053-sparkasse.xml")

  it("is recognised by content", () => {
    expect(sniffStructured(xml)).toBe("camt")
    expect(sniffStructured("date;amount\n1;2")).toBeNull()
  })

  it("reads signed amounts, counterparties and remittance info exactly", () => {
    const { rows } = parseCamt(xml, "EUR")
    expect(rows.map((r) => [r.date, r.amountMinor, r.counterparty])).toEqual([
      ["2026-10-01", 148750, "Baeckerei Mueller GmbH"],
      ["2026-10-02", -85000, "Hausverwaltung Schmidt"],
      ["2026-10-15", -6645, "ADOBE SYSTEMS"],
      ["2026-10-20", 400000, "Leasing AG"], // returned direct debit (CRDT + RvslInd) is money back in
      ["2026-10-25", -405395, "Finanzamt Berlin"],
    ])
    expect(rows[0].description).toBe("RE INV-2026-0001 Danke")
    expect(rows[3].description).toBe("Storno: Ruecklastschrift Leasing")
    expect(rows.every((r) => r.issues.length === 0)).toBe(true)
  })

  it("proves completeness with the opening and closing booked balances", () => {
    expect(parseCamt(xml, "EUR").reconciliation).toMatchObject({ openingMinor: 1250000, closingMinor: 1301710, ok: true })
    const tampered = xml.replace('<Amt Ccy="EUR">66.45</Amt>', '<Amt Ccy="EUR">76.45</Amt>')
    expect(parseCamt(tampered, "EUR").reconciliation?.ok).toBe(false)
  })

  it("flags entries in another currency", () => {
    expect(parseCamt(xml, "GBP").rows.every((r) => r.issues.includes("foreign_currency"))).toBe(true)
  })
})

describe("OFX", () => {
  const ofx = fixture("barclays.ofx")

  it("reads SGML OFX from UK banks", () => {
    expect(sniffStructured(ofx)).toBe("ofx")
    const { rows, currency } = parseOfx(ofx, "GBP")
    expect(currency).toBe("GBP")
    expect(rows.map((r) => [r.date, r.amountMinor, r.counterparty])).toEqual([
      ["2026-10-03", 240000, "NORTHWIND LTD"],
      ["2026-10-05", -4999, "SLACK TECHNOLOGIES"],
      ["2026-10-15", -125000, "WEWORK UK"],
      ["2026-10-20", 2500, "AMAZON EU"], // POS type, positive amount: a refund, not a payment
    ])
    expect(rows[0].description).toBe("INV-2026-0007 PAYMENT")
  })
})

describe("matching bank credits to invoices", () => {
  const open = [
    { id: "a", number: "INV-2026-0007", openMinor: 480000, issueDate: "2026-09-20" },
    { id: "b", number: "INV-2026-0008", openMinor: 240000, issueDate: "2026-09-25" },
  ]
  it("prefers the invoice named in the reference, even for a part payment", () => {
    expect(matchPayment({ date: "2026-10-03", amountMinor: 240000, text: "INV-2026-0007 PAYMENT" }, open, new Set())?.id).toBe("a")
    expect(matchPayment({ date: "2026-10-03", amountMinor: 240000, text: "RE INV 2026 0007" }, open, new Set())?.id).toBe("a")
  })
  it("matches whole invoice numbers only, never a longer number that starts the same", () => {
    const near = [
      { id: "one", number: "INV-2026-0001", openMinor: 500, issueDate: "2026-09-01" },
      { id: "twelve", number: "INV-2026-00012", openMinor: 500, issueDate: "2026-09-01" },
    ]
    expect(matchPayment({ date: "2026-10-03", amountMinor: 100, text: "Ref INV-2026-00012" }, near, new Set())?.id).toBe("twelve")
    expect(matchPayment({ date: "2026-10-03", amountMinor: 100, text: "inv2026/0001 thanks" }, near, new Set())?.id).toBe("one")
    expect(referencesNumber("XINV-2026-0001", "INV-2026-0001")).toBe(false)
    expect(referencesNumber("RE INV 2026 0001", "INV-2026-0001")).toBe(true)
  })

  it("falls back to the exact open amount, never to an overpayment of a named invoice", () => {
    expect(matchPayment({ date: "2026-10-03", amountMinor: 240000, text: "Thanks" }, open, new Set())?.id).toBe("b")
    expect(matchPayment({ date: "2026-10-03", amountMinor: 999999, text: "INV-2026-0007" }, open, new Set())).toBeNull()
  })
  it("ignores debits, claimed invoices and payments dated before the invoice", () => {
    expect(matchPayment({ date: "2026-10-03", amountMinor: -240000, text: "" }, open, new Set())).toBeNull()
    expect(matchPayment({ date: "2026-10-03", amountMinor: 240000, text: "" }, open, new Set(["b"]))).toBeNull()
    expect(matchPayment({ date: "2026-09-21", amountMinor: 240000, text: "" }, open, new Set())).toBeNull()
  })
})
