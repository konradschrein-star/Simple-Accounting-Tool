import type { LedgerAccountKind } from "@/jurisdictions/types"
import { addDays, monthKey, type IsoDate } from "@/lib/dates"

export type MetricInvoice = { id: string; status: "draft" | "finalized" | "paid" | "void"; issueDate: IsoDate; dueDate: IsoDate; paidDate: IsoDate | null; totalMinor: number }
export type MetricTransaction = { date: IsoDate; amountMinor: number; kind: LedgerAccountKind | null; invoiceId: string | null }

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
}

/** Movements that count as business cash in / out. Transfers and owner movements never do. */
function classify(t: MetricTransaction): "in" | "out" | null {
  if (t.kind === "transfer" || t.kind === "owner") return null
  if (t.kind === "income") return "in"
  if (t.kind === "expense" || t.kind === "tax") return "out"
  return t.amountMinor >= 0 ? "in" : "out" // uncategorized: sign heuristic
}

function period(invoices: MetricInvoice[], txns: MetricTransaction[], from: IsoDate | null, to: IsoDate): PeriodMetrics {
  const inRange = (d: IsoDate | null) => !!d && (from === null || d >= from) && d <= to
  const linked = new Set(txns.map((t) => t.invoiceId).filter(Boolean))
  const invoicedMinor = invoices.filter((i) => (i.status === "finalized" || i.status === "paid") && inRange(i.issueDate)).reduce((s, i) => s + i.totalMinor, 0)
  let cashInMinor = invoices.filter((i) => i.status === "paid" && !linked.has(i.id) && inRange(i.paidDate)).reduce((s, i) => s + i.totalMinor, 0)
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

function monthStart(iso: IsoDate, offset: number): IsoDate {
  const [y, m] = iso.split("-").map(Number)
  const d = new Date(Date.UTC(y, m - 1 + offset, 1))
  return d.toISOString().slice(0, 10)
}

export function computeMetrics(invoices: MetricInvoice[], txns: MetricTransaction[], today: IsoDate): Metrics {
  const months: MonthPoint[] = []
  for (let offset = -11; offset <= 0; offset++) {
    const start = monthStart(today, offset)
    const end = addDays(monthStart(today, offset + 1), -1)
    const p = period(invoices, txns, start, end)
    months.push({ month: monthKey(start), invoicedMinor: p.invoicedMinor, cashInMinor: p.cashInMinor, expensesMinor: p.expensesMinor })
  }
  const open = invoices.filter((i) => i.status === "finalized")
  const overdue = open.filter((i) => i.dueDate < today)
  const dates = [...txns.map((t) => t.date), ...invoices.filter((i) => i.status !== "draft").map((i) => i.issueDate)].sort()
  return {
    thisMonth: period(invoices, txns, monthStart(today, 0), today),
    trailing12: period(invoices, txns, monthStart(today, -11), today),
    trailing90: period(invoices, txns, addDays(today, -89), today),
    lifetime: period(invoices, txns, null, today),
    months,
    outstandingMinor: open.reduce((s, i) => s + i.totalMinor, 0),
    overdueMinor: overdue.reduce((s, i) => s + i.totalMinor, 0),
    overdueCount: overdue.length,
    uncategorizedCount: txns.filter((t) => t.kind === null).length,
    firstActivity: dates[0] ?? null,
  }
}
