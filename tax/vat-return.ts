import type { TaxGroup } from "@/invoicing/rules"
import { addMonths, lastDayOfMonth, monthLabel, type IsoDate } from "@/lib/dates"
import { roundHalfAwayFromZero, toBaseMinor } from "@/lib/money"

/**
 * VAT / GST / sales-tax return figures for one period, from issued documents (output tax) and booked expenses
 * (input tax). Pure: the caller resolves rates and exchange rates. Each jurisdiction lays the result out on its
 * own form (`Jurisdiction.vatReturn.lines`).
 */

export type VatPeriod = { from: IsoDate; to: IsoDate; label: string; key: string }

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** Return periods, newest first, up to the one containing `today`. Quarters end in `periodEndMonth` + 3n (UK/JE stagger). */
export function vatPeriods(frequency: "monthly" | "quarterly", periodEndMonth: number, today: IsoDate, count = 8): VatPeriod[] {
  const [year, month] = today.split("-").map(Number)
  const current = `${year}-${String(month).padStart(2, "0")}`
  const periods: VatPeriod[] = []
  if (frequency === "monthly") {
    for (let i = 0; i < count; i++) {
      const key = addMonths(current, -i)
      const [y, m] = key.split("-").map(Number)
      periods.push({ key, from: `${key}-01`, to: lastDayOfMonth(y, m), label: monthLabel(key) })
    }
    return periods
  }
  // The quarter containing today ends in the first month ≥ today's month that is ≡ periodEndMonth (mod 3).
  let end = addMonths(current, (((periodEndMonth - month) % 3) + 3) % 3)
  for (let i = 0; i < count; i++) {
    const start = addMonths(end, -2)
    const [ey, em] = end.split("-").map(Number)
    const [sy, sm] = start.split("-").map(Number)
    const label = em % 3 === 0 ? `Q${em / 3} ${ey}` : `${MONTHS[sm - 1]}${sy !== ey ? ` ${sy}` : ""}–${MONTHS[em - 1]} ${ey}`
    periods.push({ key: `${start}_${end}`, from: `${start}-01`, to: lastDayOfMonth(ey, em), label })
    end = addMonths(end, -3)
  }
  return periods
}

/** An issued invoice or credit note, amounts in its own currency. */
export type VatSalesDoc = {
  kind: "invoice" | "credit_note"
  issueDate: IsoDate
  fxRateMicro: number
  totalMinor: number
  taxGroups: TaxGroup[]
  /** Money received (invoices; document currency). */
  payments: { date: IsoDate; amountMinor: number }[]
  /** Credit notes: what the corrected invoice had received of its total — cash accounting reverses only that share. */
  corrected?: { paidMinor: number; totalMinor: number }
}

/** Expense booked from the bank: negative = money out (gross, incl. tax), positive = refund. */
export type VatPurchase = { date: IsoDate; amountMinor: number; rateBp: number; outOfScope: boolean }

export type VatSummary = {
  sales: TaxGroup[]
  salesNetMinor: number
  outputTaxMinor: number
  /** In-scope purchases only: wages and other out-of-scope payments are not "purchases" on a VAT return. */
  purchasesGrossMinor: number
  purchasesNetMinor: number
  inputTaxMinor: number
  /** Output − input: positive = payable, negative = refund due. */
  netTaxMinor: number
  documentCount: number
  purchaseCount: number
}

/**
 * When a document's tax becomes due, and which share of it. Accrual (Soll): all of it on the issue date.
 * Cash (Ist): each payment carries its share; a credit note reverses the share of its invoice that was paid.
 */
export function taxPoints(doc: VatSalesDoc, accounting: "accrual" | "cash"): { date: IsoDate; share: number }[] {
  if (accounting === "accrual") return [{ date: doc.issueDate, share: 1 }]
  if (doc.kind === "credit_note") {
    const paid = doc.corrected ? Math.min(doc.corrected.paidMinor, doc.corrected.totalMinor) : 0
    return paid && doc.corrected?.totalMinor ? [{ date: doc.issueDate, share: paid / doc.corrected.totalMinor }] : []
  }
  return doc.totalMinor ? doc.payments.map((p) => ({ date: p.date, share: p.amountMinor / doc.totalMinor })) : []
}

export function summarizeVat(
  docs: VatSalesDoc[],
  purchases: VatPurchase[],
  period: { from: IsoDate; to: IsoDate },
  accounting: "accrual" | "cash"
): VatSummary {
  const inPeriod = (date: IsoDate) => date >= period.from && date <= period.to
  const groups = new Map<number, TaxGroup>()
  let documentCount = 0
  for (const doc of docs) {
    const points = taxPoints(doc, accounting).filter((p) => inPeriod(p.date))
    if (points.length) documentCount++
    for (const { share } of points)
      for (const g of doc.taxGroups) {
        const into = groups.get(g.rateBp) ?? { rateBp: g.rateBp, netMinor: 0, taxMinor: 0 }
        into.netMinor += toBaseMinor(roundHalfAwayFromZero(g.netMinor * share), doc.fxRateMicro)
        into.taxMinor += toBaseMinor(roundHalfAwayFromZero(g.taxMinor * share), doc.fxRateMicro)
        groups.set(g.rateBp, into)
      }
  }

  let purchasesGrossMinor = 0
  let inputTaxMinor = 0
  let purchaseCount = 0
  for (const p of purchases) {
    if (!inPeriod(p.date) || p.outOfScope) continue
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
export const wholeUnits = (minor: number) => Math.trunc(minor / 100) * 100
export const salesAtRate = (summary: VatSummary, rateBp: number): TaxGroup =>
  summary.sales.find((g) => g.rateBp === rateBp) ?? { rateBp, netMinor: 0, taxMinor: 0 }
