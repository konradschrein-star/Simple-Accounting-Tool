import { describe, expect, it } from "vitest"
import { JURISDICTIONS } from "@/jurisdictions"
import { summarizeVat, vatPeriods, type VatPurchase, type VatSalesDoc } from "@/tax/vat-return"

const Q3 = { from: "2026-07-01", to: "2026-09-30" }
const expense = (date: string, amountMinor: number, rateBp: number, outOfScope = false): VatPurchase => ({ date, amountMinor, rateBp, outOfScope })
const doc = (over: Partial<VatSalesDoc>): VatSalesDoc => ({
  kind: "invoice",
  issueDate: "2026-08-10",
  fxRateMicro: 1_000_000,
  totalMinor: 119_000 + 10_700,
  taxGroups: [
    { rateBp: 1900, netMinor: 100_000, taxMinor: 19_000 },
    { rateBp: 700, netMinor: 10_000, taxMinor: 700 },
  ],
  payments: [],
  ...over,
})

describe("return periods", () => {
  it("lists calendar quarters, newest first, including the running one", () => {
    expect(vatPeriods("quarterly", 3, "2026-10-06", 3).map((p) => [p.label, p.from, p.to])).toEqual([
      ["Q4 2026", "2026-10-01", "2026-12-31"],
      ["Q3 2026", "2026-07-01", "2026-09-30"],
      ["Q2 2026", "2026-04-01", "2026-06-30"],
    ])
  })
  it("supports HMRC's staggered quarters", () => {
    expect(vatPeriods("quarterly", 1, "2026-10-06", 2).map((p) => [p.label, p.from, p.to])).toEqual([
      ["Aug–Oct 2026", "2026-08-01", "2026-10-31"],
      ["May–Jul 2026", "2026-05-01", "2026-07-31"],
    ])
    expect(vatPeriods("quarterly", 2, "2026-12-15", 1)[0]).toMatchObject({ label: "Dec 2026–Feb 2027", from: "2026-12-01", to: "2027-02-28" })
  })
  it("lists months for monthly filers", () => {
    expect(vatPeriods("monthly", 3, "2026-03-15", 2).map((p) => p.to)).toEqual(["2026-03-31", "2026-02-28"])
  })
})

describe("VAT summary", () => {
  it("accrual: tax follows the invoice date, cancellations net out through the credit note", () => {
    const cancelled = doc({})
    const creditNote = doc({
      kind: "credit_note",
      issueDate: "2026-09-02",
      taxGroups: cancelled.taxGroups.map((g) => ({ rateBp: g.rateBp, netMinor: -g.netMinor, taxMinor: -g.taxMinor })),
    })
    const s = summarizeVat([doc({}), cancelled, creditNote, doc({ issueDate: "2026-10-01" })], [], Q3, "accrual")
    expect(s.outputTaxMinor).toBe(19_700)
    expect(s.salesNetMinor).toBe(110_000)
    expect(s.documentCount).toBe(3)
  })
  it("cash: tax follows payments, pro rata for part payments", () => {
    const half = doc({}).totalMinor / 2
    const s = summarizeVat(
      [
        doc({
          payments: [
            { date: "2026-09-15", amountMinor: half },
            { date: "2026-10-03", amountMinor: half },
          ],
        }),
        doc({ issueDate: "2026-06-01", payments: [] }),
      ],
      [],
      Q3,
      "cash"
    )
    expect(s.outputTaxMinor).toBe(9_500 + 350)
    expect(s.salesNetMinor).toBe(55_000)
  })
  it("converts foreign-currency documents with their locked rate", () => {
    const s = summarizeVat([doc({ fxRateMicro: 1_170_000 })], [], Q3, "accrual")
    expect(s.outputTaxMinor).toBe(22_230 + 819)
  })
  it("cash: a credit note reverses only the share its invoice had been paid", () => {
    const invoice = doc({ issueDate: "2026-06-01", payments: [{ date: "2026-06-20", amountMinor: doc({}).totalMinor / 2 }] })
    const creditNote = doc({
      kind: "credit_note",
      issueDate: "2026-08-15",
      totalMinor: -invoice.totalMinor,
      taxGroups: invoice.taxGroups.map((g) => ({ rateBp: g.rateBp, netMinor: -g.netMinor, taxMinor: -g.taxMinor })),
      corrected: { paidMinor: invoice.totalMinor / 2, totalMinor: invoice.totalMinor },
    })
    const s = summarizeVat([invoice, creditNote], [], Q3, "cash")
    expect(s.outputTaxMinor).toBe(-(9_500 + 350))
    expect(s.documentCount).toBe(1)
    expect(summarizeVat([doc({ ...creditNote, corrected: { paidMinor: 0, totalMinor: invoice.totalMinor } })], [], Q3, "cash").documentCount).toBe(0)
  })
  it("extracts input tax from gross expenses, refunds reduce it, wages stay out of scope", () => {
    const s = summarizeVat(
      [],
      [
        expense("2026-08-01", -11_900, 1900),
        expense("2026-08-05", -5_000, 0),
        expense("2026-08-09", 1_190, 1900),
        expense("2026-08-31", -300_000, 0, true),
        expense("2026-10-01", -99_999, 1900),
      ],
      Q3,
      "accrual"
    )
    expect(s.inputTaxMinor).toBe(1_900 - 190)
    expect(s.purchasesGrossMinor).toBe(15_710)
    expect(s.purchaseCount).toBe(3)
  })
})

describe("form layouts", () => {
  const summary = summarizeVat(
    [
      doc({
        taxGroups: [
          { rateBp: 1900, netMinor: 100_099, taxMinor: 19_019 },
          { rateBp: 700, netMinor: 10_000, taxMinor: 700 },
        ],
      }),
    ],
    [expense("2026-08-01", -11_900, 1900)],
    Q3,
    "accrual"
  )
  it("UStVA: whole-euro bases in Kz 81/86, Vorsteuer in Kz 66, Kz 83 = balance", () => {
    const lines = Object.fromEntries(JURISDICTIONS.de.vatReturn.lines(summary).map((l) => [l.key, l]))
    expect(lines["81"]).toMatchObject({ baseMinor: 100_000, taxMinor: 19_019 })
    expect(lines["86"]).toMatchObject({ baseMinor: 10_000, taxMinor: 700 })
    expect(lines["66"].taxMinor).toBe(1_900)
    expect(lines["83"].taxMinor).toBe(19_019 + 700 - 1_900)
  })
  it("UK: the nine boxes add up", () => {
    const boxes = Object.fromEntries(JURISDICTIONS.uk.vatReturn.lines(summary).map((l) => [l.box, l]))
    expect(boxes["3"].taxMinor).toBe(boxes["1"].taxMinor)
    expect(boxes["5"].taxMinor).toBe(boxes["3"].taxMinor! - boxes["4"].taxMinor!)
    expect(boxes["6"].baseMinor).toBe(110_000)
    expect(boxes["7"].baseMinor).toBe(10_000)
  })
  it("UK: box 5 is always positive and says which way the money goes", () => {
    const refund = summarizeVat([], [expense("2026-08-01", -12_000, 2000)], Q3, "accrual")
    const box5 = JURISDICTIONS.uk.vatReturn.lines(refund).find((l) => l.box === "5")!
    expect(box5).toMatchObject({ taxMinor: 2_000, label: "Net VAT to reclaim from HMRC" })
  })
})
