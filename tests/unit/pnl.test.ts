import { describe, expect, it } from "vitest"
import type { AccountRef } from "@/bookkeeping/categorize"
import { closeReady, computePnl, draftSummary } from "@/bookkeeping/pnl"

const accounts: AccountRef[] = [
  { id: "inc", code: "8400", name: "Erlöse", kind: "income", taxLine: "EÜR" },
  { id: "rent", code: "4210", name: "Miete", kind: "expense", taxLine: null },
  { id: "tax", code: "1780", name: "USt", kind: "tax", taxLine: null },
  { id: "trf", code: "1360", name: "Transit", kind: "transfer", taxLine: null },
  { id: "own", code: "1800", name: "Privat", kind: "owner", taxLine: null },
]
const period = { from: "2026-10-01", to: "2026-10-31" }
const prior = { from: "2026-09-01", to: "2026-09-30" }

describe("P&L", () => {
  const pnl = computePnl({
    accounts,
    period,
    prior,
    unlinkedPaid: [{ paidDate: "2026-10-10", totalMinor: 50000 }],
    txns: [
      { date: "2026-10-01", amountMinor: 300000, accountId: "inc" },
      { date: "2026-09-01", amountMinor: 200000, accountId: "inc" },
      { date: "2026-10-02", amountMinor: -85000, accountId: "rent" },
      { date: "2026-09-02", amountMinor: -85000, accountId: "rent" },
      { date: "2026-10-10", amountMinor: -40000, accountId: "tax" },
      { date: "2026-10-11", amountMinor: -100000, accountId: "trf" },
      { date: "2026-10-12", amountMinor: -20000, accountId: "own" },
      { date: "2026-10-13", amountMinor: -999, accountId: null },
    ],
  })
  it("totals income, expenses and net; excludes transfers and owner movements", () => {
    expect(pnl).toMatchObject({ incomeMinor: 350000, expensesMinor: 125000, netMinor: 225000, priorIncomeMinor: 200000, priorNetMinor: 115000, uncategorizedMinor: -999 })
    expect(pnl.expenses.map((l) => l.code)).toEqual(["1780", "4210"])
  })
  it("shows unlinked paid invoices as income", () => {
    expect(pnl.income.find((l) => l.accountId === null)?.amountMinor).toBe(50000)
  })
  it("drafts a factual summary with watch items", () => {
    const s = draftSummary({ monthLabel: "October 2026", pnl, currency: "EUR", locale: "en-GB", overdueMinor: 1000, nextDeadline: { title: "USt-VA", date: "2026-11-10" } })
    expect(s.headline).toMatch(/^October 2026: net profit/)
    expect(s.watchItems).toHaveLength(2)
  })
})

describe("close checklist", () => {
  it("needs transactions, an empty review queue and no pending imports", () => {
    expect(closeReady({ transactions: 5, needsReview: 0, pendingImports: 0, unreconciledImports: 0 })).toBe(true)
    expect(closeReady({ transactions: 5, needsReview: 1, pendingImports: 0, unreconciledImports: 0 })).toBe(false)
    expect(closeReady({ transactions: 0, needsReview: 0, pendingImports: 0, unreconciledImports: 0 })).toBe(false)
  })
})
