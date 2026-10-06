import type { DocumentKind, DocumentStatus } from "@/invoicing/documents"
import type { LedgerAccountKind } from "@/jurisdictions/types"
import { addDays, addMonths, monthKey, monthRange, type IsoDate } from "@/lib/dates"

/** Amounts are already in the workspace currency (converted with each document's locked rate). */
export type MetricInvoice = { id: string; kind: DocumentKind; status: DocumentStatus; issueDate: IsoDate; dueDate: IsoDate; totalMinor: number }
/** Payments recorded against invoices; those with a transaction are already part of the bank ledger. */
export type MetricPayment = { invoiceId: string; date: IsoDate; amountMinor: number; transactionId: string | null }
export type MetricTransaction = { date: IsoDate; amountMinor: number; kind: LedgerAccountKind | null }

export type PeriodMetrics = {
  invoicedMinor: number
  cashInMinor: number
  expensesMinor: number
  netMinor: number
  /** Net margin in basis points; null when nothing was collected. */
  marginBp: number | null
}

export type MonthPoint = { month: string; invoicedMinor: number; cashInMinor: number; expensesMinor: number }

export type Metrics = {
  thisMonth: PeriodMetrics
  trailing12: PeriodMetrics
  trailing90: PeriodMetrics
  lifetime: PeriodMetrics
  months: MonthPoint[]
  outstandingMinor: number
  overdueMinor: number
  overdueCount: number
  uncategorizedCount: number
  firstActivity: IsoDate | null
  /** Average monthly expenses over the last 3 full months — the burn rate. */
  burnMinor: number
}

/** Movements that count as business cash in / out. Transfers and owner movements never do. */
function classify(t: MetricTransaction): "in" | "out" | null {
  if (t.kind === "transfer" || t.kind === "owner") return null
  if (t.kind === "income") return "in"
  if (t.kind === "expense" || t.kind === "tax") return "out"
  return t.amountMinor >= 0 ? "in" : "out" // uncategorized: sign heuristic
}

/** Issued revenue: invoices that went out (incl. later-cancelled ones) less every credit note issued. */
function countsAsInvoiced(i: MetricInvoice): boolean {
  if (i.kind === "invoice") return i.status === "finalized" || i.status === "paid" || i.status === "cancelled"
  return i.kind === "credit_note" && i.status === "finalized"
}

function period(invoices: MetricInvoice[], payments: MetricPayment[], txns: MetricTransaction[], from: IsoDate | null, to: IsoDate): PeriodMetrics {
  const inRange = (d: IsoDate) => (from === null || d >= from) && d <= to
  const invoicedMinor = invoices.filter((i) => countsAsInvoiced(i) && inRange(i.issueDate)).reduce((s, i) => s + i.totalMinor, 0)
  let cashInMinor = payments.filter((p) => !p.transactionId && inRange(p.date)).reduce((s, p) => s + p.amountMinor, 0)
  let expensesMinor = 0
  for (const t of txns) {
    if (!inRange(t.date)) continue
    const c = classify(t)
    if (c === "in") cashInMinor += t.amountMinor
    if (c === "out") expensesMinor += -t.amountMinor
  }
  const netMinor = cashInMinor - expensesMinor
  return { invoicedMinor, cashInMinor, expensesMinor, netMinor, marginBp: cashInMinor > 0 ? Math.round((netMinor / cashInMinor) * 10000) : null }
}

export function computeMetrics(invoices: MetricInvoice[], payments: MetricPayment[], txns: MetricTransaction[], today: IsoDate): Metrics {
  const months: MonthPoint[] = []
  for (let offset = -11; offset <= 0; offset++) {
    const month = addMonths(monthKey(today), offset)
    const { from, to } = monthRange(month)
    const p = period(invoices, payments, txns, from, to)
    months.push({ month, invoicedMinor: p.invoicedMinor, cashInMinor: p.cashInMinor, expensesMinor: p.expensesMinor })
  }
  const paidById = new Map<string, number>()
  for (const p of payments) paidById.set(p.invoiceId, (paidById.get(p.invoiceId) ?? 0) + p.amountMinor)
  const open = invoices.filter((i) => i.kind === "invoice" && i.status === "finalized").map((i) => ({ ...i, openMinor: Math.max(0, i.totalMinor - (paidById.get(i.id) ?? 0)) }))
  const overdue = open.filter((i) => i.dueDate < today)
  const dates = [...txns.map((t) => t.date), ...invoices.filter(countsAsInvoiced).map((i) => i.issueDate)].sort()
  return {
    thisMonth: period(invoices, payments, txns, monthRange(monthKey(today)).from, today),
    trailing12: period(invoices, payments, txns, monthRange(addMonths(monthKey(today), -11)).from, today),
    trailing90: period(invoices, payments, txns, addDays(today, -89), today),
    lifetime: period(invoices, payments, txns, null, today),
    months,
    outstandingMinor: open.reduce((s, i) => s + i.openMinor, 0),
    overdueMinor: overdue.reduce((s, i) => s + i.openMinor, 0),
    overdueCount: overdue.length,
    uncategorizedCount: txns.filter((t) => t.kind === null).length,
    firstActivity: dates[0] ?? null,
    burnMinor: Math.round(months.slice(-4, -1).reduce((s, m) => s + m.expensesMinor, 0) / 3),
  }
}
