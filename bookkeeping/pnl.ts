import type { CloseChecklist, CloseSummary } from "@/db/schema"
import type { IsoDate } from "@/lib/dates"
import { formatMoney, type CurrencyCode } from "@/lib/money"
import type { AccountRef } from "./categorize"

export type PnlTransaction = { date: IsoDate; amountMinor: number; accountId: string | null }
export type PnlLine = { accountId: string | null; code: string; name: string; taxLine: string | null; amountMinor: number; priorMinor: number }
export type Pnl = {
  income: PnlLine[]
  expenses: PnlLine[]
  incomeMinor: number
  expensesMinor: number
  netMinor: number
  priorIncomeMinor: number
  priorExpensesMinor: number
  priorNetMinor: number
  uncategorizedMinor: number
}

const inRange = (d: IsoDate, from: IsoDate, to: IsoDate) => d >= from && d <= to

/**
 * Cash-basis P&L from the ledger. Income accounts show money in, expense and tax accounts show money out
 * (as positive numbers). Transfers and owner movements are excluded; uncategorized lines are reported separately.
 * `unlinkedPaid` are paid invoices whose payment is not on an imported statement — shown as invoice income.
 */
export function computePnl(input: {
  txns: PnlTransaction[]
  accounts: AccountRef[]
  unlinkedPaid: { paidDate: IsoDate; totalMinor: number }[]
  period: { from: IsoDate; to: IsoDate }
  prior: { from: IsoDate; to: IsoDate }
}): Pnl {
  const byId = new Map(input.accounts.map((a) => [a.id, a]))
  const lines = new Map<string, PnlLine>()
  let uncategorizedMinor = 0
  const add = (key: string, base: Omit<PnlLine, "amountMinor" | "priorMinor">, current: number, prior: number) => {
    const line = lines.get(key) ?? { ...base, amountMinor: 0, priorMinor: 0 }
    line.amountMinor += current
    line.priorMinor += prior
    lines.set(key, line)
  }
  for (const t of input.txns) {
    const current = inRange(t.date, input.period.from, input.period.to)
    const prior = inRange(t.date, input.prior.from, input.prior.to)
    if (!current && !prior) continue
    const account = t.accountId ? byId.get(t.accountId) : undefined
    if (!account) {
      if (current) uncategorizedMinor += t.amountMinor
      continue
    }
    if (account.kind === "transfer" || account.kind === "owner") continue
    const signed = account.kind === "income" ? t.amountMinor : -t.amountMinor
    add(account.id, { accountId: account.id, code: account.code, name: account.name, taxLine: account.taxLine }, current ? signed : 0, prior ? signed : 0)
  }
  for (const inv of input.unlinkedPaid) {
    const current = inRange(inv.paidDate, input.period.from, input.period.to)
    const prior = inRange(inv.paidDate, input.prior.from, input.prior.to)
    if (current || prior) add("invoices", { accountId: null, code: "—", name: "Invoices paid (not on imported statements)", taxLine: null }, current ? inv.totalMinor : 0, prior ? inv.totalMinor : 0)
  }
  const all = [...lines.values()].filter((l) => l.amountMinor || l.priorMinor).sort((a, b) => a.code.localeCompare(b.code))
  const isIncome = (l: PnlLine) => l.accountId === null || byId.get(l.accountId)?.kind === "income"
  const income = all.filter(isIncome)
  const expenses = all.filter((l) => !isIncome(l))
  const sum = (ls: PnlLine[], key: "amountMinor" | "priorMinor") => ls.reduce((s, l) => s + l[key], 0)
  const incomeMinor = sum(income, "amountMinor")
  const expensesMinor = sum(expenses, "amountMinor")
  const priorIncomeMinor = sum(income, "priorMinor")
  const priorExpensesMinor = sum(expenses, "priorMinor")
  return {
    income,
    expenses,
    incomeMinor,
    expensesMinor,
    netMinor: incomeMinor - expensesMinor,
    priorIncomeMinor,
    priorExpensesMinor,
    priorNetMinor: priorIncomeMinor - priorExpensesMinor,
    uncategorizedMinor,
  }
}

export function closeReady(c: CloseChecklist): boolean {
  return c.transactions > 0 && c.needsReview === 0 && c.pendingImports === 0
}

/**
 * Deterministic month summary — used when no LLM is configured and as the factual skeleton the LLM rewrites.
 */
export function draftSummary(input: { monthLabel: string; pnl: Pnl; currency: CurrencyCode; locale: string; overdueMinor: number; nextDeadline: { title: string; date: string } | null }): CloseSummary {
  const { pnl } = input
  const money = (m: number) => formatMoney(m, input.currency, input.locale)
  const margin = pnl.incomeMinor > 0 ? Math.round((pnl.netMinor / pnl.incomeMinor) * 100) : null
  const movers = [...pnl.expenses]
    .map((l) => ({ ...l, delta: l.amountMinor - l.priorMinor }))
    .filter((l) => l.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 3)
  const bullets = [
    `Income ${money(pnl.incomeMinor)} (${pnl.incomeMinor >= pnl.priorIncomeMinor ? "up" : "down"} from ${money(pnl.priorIncomeMinor)} the month before).`,
    `Expenses ${money(pnl.expensesMinor)} (previous month ${money(pnl.priorExpensesMinor)}).`,
    ...movers.map((m) => `${m.name}: ${money(m.amountMinor)} (${m.delta > 0 ? "+" : ""}${money(m.delta)} vs. prior month).`),
  ]
  const watchItems = [
    input.overdueMinor > 0 ? `${money(input.overdueMinor)} in overdue invoices — follow up to protect cash.` : null,
    input.nextDeadline ? `${input.nextDeadline.title} due ${input.nextDeadline.date} — set aside the cash now.` : null,
    margin !== null && margin < 25 ? `Net margin of ${margin} % is below a healthy 25 % buffer.` : null,
  ].filter((x): x is string => !!x)
  return {
    headline: `${input.monthLabel}: net ${pnl.netMinor >= 0 ? "profit" : "loss"} of ${money(Math.abs(pnl.netMinor))}${margin !== null ? ` (${margin} % margin)` : ""}`,
    bullets,
    watchItems,
  }
}
