import type { JurisdictionCode } from "@/jurisdictions/types"
import { addMonths, lastDayOfMonth, monthLabel, type IsoDate } from "@/lib/dates"
import { roundHalfAwayFromZero, toBaseMinor } from "@/lib/money"

/**
 * VAT / GST / sales-tax return figures for one period, from issued documents (output tax) and booked expenses
 * (input tax). Pure: the caller resolves rates and exchange rates; everything here is in the workspace currency.
 */

export type VatPeriod = { from: IsoDate; to: IsoDate; label: string; key: string }

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** Return periods, newest first, up to the one containing `today`. Quarters end in `periodEndMonth` + 3n (UK/JE stagger). */
export function vatPeriods(frequency: "monthly" | "quarterly" | "none", periodEndMonth: number, today: IsoDate, count = 8): VatPeriod[] {
  const [year, month] = today.split("-").map(Number)
  const periods: VatPeriod[] = []
  if (frequency === "monthly") {
    for (let i = 0; i < count; i++) {
      const key = addMonths(`${year}-${String(month).padStart(2, "0")}`, -i)
      const [y, m] = key.split("-").map(Number)
      periods.push({ key, from: `${key}-01`, to: lastDayOfMonth(y, m), label: monthLabel(key) })
    }
    return periods
  }
  // The quarter containing today ends in the first month ≥ today's month that is ≡ periodEndMonth (mod 3).
  const offset = (((periodEndMonth - month) % 3) + 3) % 3
  let end = addMonths(`${year}-${String(month).padStart(2, "0")}`, offset)
  for (let i = 0; i < count; i++) {
    const start = addMonths(end, -2)
    const [ey, em] = end.split("-").map(Number)
    const [sy, sm] = start.split("-").map(Number)
    const calendar = em % 3 === 0
    const label = calendar ? `Q${em / 3} ${ey}` : `${MONTHS[sm - 1]}${sy !== ey ? ` ${sy}` : ""}–${MONTHS[em - 1]} ${ey}`
    periods.push({ key: `${start}_${end}`, from: `${start}-01`, to: lastDayOfMonth(ey, em), label })
    end = addMonths(end, -3)
  }
  return periods
}

export type TaxGroup = { rateBp: number; netMinor: number; taxMinor: number }
export type VatSalesDoc = {
  kind: "invoice" | "credit_note"
  status: string
  issueDate: IsoDate
  fxRateMicro: number
  totalMinor: number
  taxGroups: TaxGroup[]
  payments: { date: IsoDate; amountMinor: number }[]
  /** Credit notes only: whether the corrected invoice had received money (cash accounting reverses only that). */
  relatedPaid?: boolean
}
/** Expense booked from the bank: negative = money out (gross, incl. tax), positive = refund. */
export type VatPurchase = { date: IsoDate; amountMinor: number; rateBp: number }

export type VatSummary = {
  sales: TaxGroup[]
  salesNetMinor: number
  outputTaxMinor: number
  purchasesGrossMinor: number
  purchasesNetMinor: number
  inputTaxMinor: number
  /** Output − input: positive = payable, negative = refund due. */
  netTaxMinor: number
  documentCount: number
  purchaseCount: number
}

const issued = (d: VatSalesDoc) => (d.kind === "invoice" ? ["finalized", "paid", "cancelled"].includes(d.status) : d.status === "finalized")

export function summarizeVat(docs: VatSalesDoc[], purchases: VatPurchase[], period: { from: IsoDate; to: IsoDate }, accounting: "accrual" | "cash"): VatSummary {
  const inPeriod = (date: IsoDate) => date >= period.from && date <= period.to
  const groups = new Map<number, TaxGroup>()
  const add = (rateBp: number, netMinor: number, taxMinor: number) => {
    const g = groups.get(rateBp) ?? { rateBp, netMinor: 0, taxMinor: 0 }
    g.netMinor += netMinor
    g.taxMinor += taxMinor
    groups.set(rateBp, g)
  }
  let documentCount = 0
  for (const doc of docs) {
    if (!issued(doc)) continue
    const base = (minor: number) => toBaseMinor(minor, doc.fxRateMicro)
    if (accounting === "accrual" || doc.kind === "credit_note") {
      // Accrual (Soll): tax is due when the document is issued. Cash: credit notes still follow their invoice.
      if (!inPeriod(doc.issueDate) || (accounting === "cash" && !doc.relatedPaid)) continue
      documentCount++
      for (const g of doc.taxGroups) add(g.rateBp, base(g.netMinor), base(g.taxMinor))
      continue
    }
    // Cash (Ist): each payment carries its share of every tax group.
    const received = doc.payments.filter((p) => inPeriod(p.date))
    if (!received.length || !doc.totalMinor) continue
    documentCount++
    for (const p of received) {
      const share = p.amountMinor / doc.totalMinor
      for (const g of doc.taxGroups) add(g.rateBp, base(roundHalfAwayFromZero(g.netMinor * share)), base(roundHalfAwayFromZero(g.taxMinor * share)))
    }
  }

  let purchasesGrossMinor = 0
  let inputTaxMinor = 0
  let purchaseCount = 0
  for (const p of purchases) {
    if (!inPeriod(p.date)) continue
    purchaseCount++
    const gross = -p.amountMinor
    purchasesGrossMinor += gross
    inputTaxMinor += roundHalfAwayFromZero((gross * p.rateBp) / (10_000 + p.rateBp))
  }

  const sales = [...groups.values()].sort((a, b) => b.rateBp - a.rateBp)
  const outputTaxMinor = sales.reduce((s, g) => s + g.taxMinor, 0)
  return {
    sales,
    salesNetMinor: sales.reduce((s, g) => s + g.netMinor, 0),
    outputTaxMinor,
    purchasesGrossMinor,
    purchasesNetMinor: purchasesGrossMinor - inputTaxMinor,
    inputTaxMinor,
    netTaxMinor: outputTaxMinor - inputTaxMinor,
    documentCount,
    purchaseCount,
  }
}

export type ReturnLine = { key: string; box: string | null; label: string; baseMinor: number | null; taxMinor: number | null; total?: boolean }

/** Whole currency units, as the DE and UK forms ask for tax bases (cents dropped, not rounded). */
const whole = (minor: number) => Math.trunc(minor / 100) * 100
const rateOf = (summary: VatSummary, rateBp: number) => summary.sales.find((g) => g.rateBp === rateBp) ?? { rateBp, netMinor: 0, taxMinor: 0 }

/** The figures laid out like the official form of each jurisdiction. */
export function returnLines(code: JurisdictionCode, s: VatSummary): ReturnLine[] {
  switch (code) {
    case "de": {
      const standard = rateOf(s, 1900)
      const reduced = rateOf(s, 700)
      const zero = rateOf(s, 0)
      const other = s.sales.filter((g) => ![1900, 700, 0].includes(g.rateBp))
      return [
        { key: "81", box: "81", label: "Steuerpflichtige Umsätze zu 19 %", baseMinor: whole(standard.netMinor), taxMinor: standard.taxMinor },
        { key: "86", box: "86", label: "Steuerpflichtige Umsätze zu 7 %", baseMinor: whole(reduced.netMinor), taxMinor: reduced.taxMinor },
        ...(other.length
          ? [{ key: "35", box: "35/36", label: "Umsätze zu anderen Steuersätzen", baseMinor: whole(other.reduce((t, g) => t + g.netMinor, 0)), taxMinor: other.reduce((t, g) => t + g.taxMinor, 0) }]
          : []),
        ...(zero.netMinor ? [{ key: "45", box: "45", label: "Nicht steuerbare / steuerfreie Umsätze (prüfen)", baseMinor: whole(zero.netMinor), taxMinor: null }] : []),
        { key: "66", box: "66", label: "Vorsteuerbeträge aus Rechnungen von anderen Unternehmern", baseMinor: null, taxMinor: s.inputTaxMinor },
        { key: "83", box: "83", label: s.netTaxMinor >= 0 ? "Verbleibende Umsatzsteuer-Vorauszahlung" : "Verbleibender Überschuss (Erstattung)", baseMinor: null, taxMinor: s.netTaxMinor, total: true },
      ]
    }
    case "uk":
      return [
        { key: "1", box: "1", label: "VAT due on sales and other outputs", baseMinor: null, taxMinor: s.outputTaxMinor },
        { key: "2", box: "2", label: "VAT due on acquisitions from the EU (Northern Ireland only)", baseMinor: null, taxMinor: 0 },
        { key: "3", box: "3", label: "Total VAT due (boxes 1 + 2)", baseMinor: null, taxMinor: s.outputTaxMinor },
        { key: "4", box: "4", label: "VAT reclaimed on purchases and other inputs", baseMinor: null, taxMinor: s.inputTaxMinor },
        { key: "5", box: "5", label: s.netTaxMinor >= 0 ? "Net VAT to pay to HMRC" : "Net VAT to reclaim from HMRC", baseMinor: null, taxMinor: Math.abs(s.netTaxMinor), total: true },
        { key: "6", box: "6", label: "Total value of sales and outputs, excluding VAT", baseMinor: whole(s.salesNetMinor), taxMinor: null },
        { key: "7", box: "7", label: "Total value of purchases and inputs, excluding VAT", baseMinor: whole(s.purchasesNetMinor), taxMinor: null },
        { key: "8", box: "8", label: "Supplies of goods to the EU (Northern Ireland only)", baseMinor: 0, taxMinor: null },
        { key: "9", box: "9", label: "Acquisitions of goods from the EU (Northern Ireland only)", baseMinor: 0, taxMinor: null },
      ]
    case "je":
      return [
        { key: "supplies", box: null, label: "Value of supplies made (excluding GST)", baseMinor: s.salesNetMinor, taxMinor: null },
        { key: "output", box: null, label: "GST charged on supplies", baseMinor: null, taxMinor: s.outputTaxMinor },
        { key: "purchases", box: null, label: "Value of purchases (excluding GST)", baseMinor: s.purchasesNetMinor, taxMinor: null },
        { key: "input", box: null, label: "GST paid on purchases (input tax)", baseMinor: null, taxMinor: s.inputTaxMinor },
        { key: "net", box: null, label: s.netTaxMinor >= 0 ? "GST payable to Revenue Jersey" : "GST repayable to you", baseMinor: null, taxMinor: Math.abs(s.netTaxMinor), total: true },
      ]
    case "us":
      return [
        ...s.sales.map((g) => ({ key: `rate-${g.rateBp}`, box: null, label: g.rateBp ? `Taxable sales at ${g.rateBp / 100} %` : "Non-taxable / exempt sales", baseMinor: g.netMinor, taxMinor: g.rateBp ? g.taxMinor : null })),
        { key: "collected", box: null, label: "Sales tax collected — to remit to your state", baseMinor: s.salesNetMinor, taxMinor: s.outputTaxMinor, total: true },
      ]
  }
}
