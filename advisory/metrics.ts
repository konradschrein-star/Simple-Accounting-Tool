import { openAmount, type DocumentKind, type DocumentStatus } from "@/invoicing/documents"
import type { LedgerAccountKind } from "@/jurisdictions/types"
import { addDays, addMonths, monthKey, monthRange, type IsoDate } from "@/lib/dates"

/** Amounts are already in the workspace currency (converted with each document's locked rate). */
export type MetricInvoice = {
  id: string
  clientId: string | null
  kind: DocumentKind
  status: DocumentStatus
  issueDate: IsoDate
  dueDate: IsoDate
  totalMinor: number
}
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

/** What a client still owes on one issued invoice, in the workspace currency. */
export type Receivable = { invoiceId: string; clientId: string | null; dueDate: IsoDate; openMinor: number; overdue: boolean }

export type MonthPoint = { month: string; invoicedMinor: number; cashInMinor: number; expensesMinor: number }

export type Metrics = {
  thisMonth: PeriodMetrics
  trailing12: PeriodMetrics
  trailing90: PeriodMetrics
  lifetime: PeriodMetrics
  months: MonthPoint[]
  receivables: Receivable[]
  outstandingMinor: number
  overdueMinor: number
  overdueCount: number
  uncategorizedCount: number
  firstActivity: IsoDate | null
}

/** Ledger accounts whose movements are business spending ("Expenses" everywhere on the dashboard). */
export const OUTFLOW_KINDS = ["expense", "tax"] as const satisfies readonly LedgerAccountKind[]

/** Movements that count as business cash in / out. Transfers and owner movements never do. */
function classify(t: MetricTransaction): "in" | "out" | null {
  if (t.kind === null) return t.amountMinor >= 0 ? "in" : "out" // uncategorized: sign heuristic
  if (t.kind === "income") return "in"
  return (OUTFLOW_KINDS as readonly LedgerAccountKind[]).includes(t.kind) ? "out" : null
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
  const receivables: Receivable[] = invoices
    .filter((i) => i.kind === "invoice" && i.status === "finalized")
    .map((i) => ({
      invoiceId: i.id,
      clientId: i.clientId,
      dueDate: i.dueDate,
      openMinor: openAmount(i.totalMinor, paidById.get(i.id) ?? 0),
      overdue: i.dueDate < today,
    }))
  const overdue = receivables.filter((r) => r.overdue)
  const dates = [...txns.map((t) => t.date), ...invoices.filter(countsAsInvoiced).map((i) => i.issueDate)].sort()
  return {
    thisMonth: period(invoices, payments, txns, monthRange(monthKey(today)).from, today),
    trailing12: period(invoices, payments, txns, monthRange(addMonths(monthKey(today), -11)).from, today),
    trailing90: period(invoices, payments, txns, addDays(today, -89), today),
    lifetime: period(invoices, payments, txns, null, today),
    months,
    receivables,
    outstandingMinor: receivables.reduce((s, r) => s + r.openMinor, 0),
    overdueMinor: overdue.reduce((s, r) => s + r.openMinor, 0),
    overdueCount: overdue.length,
    uncategorizedCount: txns.filter((t) => t.kind === null).length,
    firstActivity: dates[0] ?? null,
  }
}

/** Open and overdue amounts per client. */
export function receivablesByClient(receivables: Receivable[]): Map<string, { openMinor: number; overdueMinor: number }> {
  const byClient = new Map<string, { openMinor: number; overdueMinor: number }>()
  for (const r of receivables) {
    if (!r.clientId) continue
    const entry = byClient.get(r.clientId) ?? { openMinor: 0, overdueMinor: 0 }
    entry.openMinor += r.openMinor
    if (r.overdue) entry.overdueMinor += r.openMinor
    byClient.set(r.clientId, entry)
  }
  return byClient
}
