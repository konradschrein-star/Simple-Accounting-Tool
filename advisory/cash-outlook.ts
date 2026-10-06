import type { MonthPoint } from "./metrics"
import { addDays, type IsoDate } from "@/lib/dates"

export type CashOutlookInput = {
  /** Last known bank balance and its date; movements booked after that date are added on top. */
  balance: { amountMinor: number; date: IsoDate } | null
  movementsSinceMinor: number
  /** Monthly history from the metrics (oldest first, current month last). */
  months: MonthPoint[]
  /** What clients still owe, by due date (overdue ones included). */
  receivables: { dueDate: IsoDate; openMinor: number }[]
  /** Recurring invoices that will be issued, by issue date. */
  scheduled: { date: IsoDate; amountMinor: number }[]
  today: IsoDate
}

export type CashOutlook = {
  /** Last known balance plus everything booked since; null until the user gives one. */
  balance: { amountMinor: number; asOf: IsoDate } | null
  /** Average of the last three full months. */
  avgCashInMinor: number
  avgExpensesMinor: number
  /** Expenses minus cash in per month; ≤ 0 means the business funds itself. */
  netBurnMinor: number
  /** Months the balance lasts at the current net burn; null when not burning or the balance is unknown. */
  runwayMonths: number | null
  next30: { receivablesMinor: number; scheduledMinor: number; expensesMinor: number; netMinor: number; endBalanceMinor: number | null }
}

export function cashOutlook(input: CashOutlookInput): CashOutlook {
  const full = input.months.slice(-4, -1)
  const avg = (pick: (m: MonthPoint) => number) => (full.length ? Math.round(full.reduce((s, m) => s + pick(m), 0) / full.length) : 0)
  const avgCashInMinor = avg((m) => m.cashInMinor)
  const avgExpensesMinor = avg((m) => m.expensesMinor)
  const netBurnMinor = avgExpensesMinor - avgCashInMinor
  const balanceMinor = input.balance ? input.balance.amountMinor + input.movementsSinceMinor : null
  const horizon = addDays(input.today, 30)
  const receivablesMinor = input.receivables.filter((r) => r.dueDate <= horizon).reduce((s, r) => s + r.openMinor, 0)
  const scheduledMinor = input.scheduled.filter((s) => s.date >= input.today && s.date <= horizon).reduce((s, x) => s + x.amountMinor, 0)
  // Recurring invoices issued in the window are usually paid after it, so they are shown but not counted as cash.
  const netMinor = receivablesMinor - avgExpensesMinor
  return {
    balance: input.balance && balanceMinor !== null ? { amountMinor: balanceMinor, asOf: input.balance.date } : null,
    avgCashInMinor,
    avgExpensesMinor,
    netBurnMinor,
    runwayMonths: balanceMinor !== null && netBurnMinor > 0 ? Math.max(0, balanceMinor) / netBurnMinor : null,
    next30: {
      receivablesMinor,
      scheduledMinor,
      expensesMinor: avgExpensesMinor,
      netMinor,
      endBalanceMinor: balanceMinor === null ? null : balanceMinor + netMinor,
    },
  }
}

/** Expenses grouped by account, largest first; the tail folds into "Other" so the list stays readable. */
export function topCategories(rows: { name: string; amountMinor: number }[], keep = 5): { name: string; amountMinor: number }[] {
  const sorted = [...rows].filter((r) => r.amountMinor > 0).sort((a, b) => b.amountMinor - a.amountMinor)
  if (sorted.length <= keep + 1) return sorted
  const rest = sorted.slice(keep).reduce((s, r) => s + r.amountMinor, 0)
  return [...sorted.slice(0, keep), { name: "Other", amountMinor: rest }]
}
