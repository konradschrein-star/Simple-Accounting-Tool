import { describe, expect, it } from "vitest"
import { cashOutlook, topCategories } from "@/advisory/cash-outlook"

const month = (m: string, cashInMinor: number, expensesMinor: number) => ({ month: m, invoicedMinor: 0, cashInMinor, expensesMinor })
const months = [
  month("2026-06", 1, 1),
  month("2026-07", 500_000, 800_000),
  month("2026-08", 400_000, 700_000),
  month("2026-09", 600_000, 600_000),
  month("2026-10", 0, 50_000),
]

describe("cash outlook", () => {
  it("averages the last three full months and derives burn and runway", () => {
    const o = cashOutlook({
      balance: { amountMinor: 1_000_000, date: "2026-09-30" },
      movementsSinceMinor: -100_000,
      months,
      receivables: [],
      scheduled: [],
      today: "2026-10-06",
    })
    expect(o.balanceMinor).toBe(900_000)
    expect(o.avgCashInMinor).toBe(500_000)
    expect(o.avgExpensesMinor).toBe(700_000)
    expect(o.netBurnMinor).toBe(200_000)
    expect(o.runwayMonths).toBe(4.5)
  })

  it("has no runway figure for a self-funding business or an unknown balance", () => {
    const profitable = [month("2026-07", 900_000, 100_000), month("2026-08", 900_000, 100_000), month("2026-09", 900_000, 100_000), month("2026-10", 0, 0)]
    expect(
      cashOutlook({
        balance: { amountMinor: 1, date: "2026-09-30" },
        movementsSinceMinor: 0,
        months: profitable,
        receivables: [],
        scheduled: [],
        today: "2026-10-06",
      }).runwayMonths
    ).toBeNull()
    expect(cashOutlook({ balance: null, movementsSinceMinor: 0, months, receivables: [], scheduled: [], today: "2026-10-06" })).toMatchObject({
      balanceMinor: null,
      runwayMonths: null,
    })
  })

  it("projects 30 days: receivables due (overdue included) minus typical expenses", () => {
    const o = cashOutlook({
      balance: { amountMinor: 1_000_000, date: "2026-10-06" },
      movementsSinceMinor: 0,
      months,
      receivables: [
        { dueDate: "2026-09-01", openMinor: 100_000 },
        { dueDate: "2026-10-30", openMinor: 200_000 },
        { dueDate: "2026-12-01", openMinor: 999_999 },
      ],
      scheduled: [
        { date: "2026-11-01", amountMinor: 180_000 },
        { date: "2027-01-01", amountMinor: 1 },
      ],
      today: "2026-10-06",
    })
    expect(o.next30).toEqual({ receivablesMinor: 300_000, scheduledMinor: 180_000, expensesMinor: 700_000, netMinor: -400_000, endBalanceMinor: 600_000 })
  })
})

describe("spending categories", () => {
  it("keeps the biggest and folds the tail into Other", () => {
    const rows = ["A", "B", "C", "D", "E", "F", "G"].map((name, i) => ({ name, amountMinor: (7 - i) * 100 }))
    expect(topCategories(rows, 3)).toEqual([
      { name: "A", amountMinor: 700 },
      { name: "B", amountMinor: 600 },
      { name: "C", amountMinor: 500 },
      { name: "Other", amountMinor: 400 + 300 + 200 + 100 },
    ])
    expect(topCategories(rows.slice(0, 4), 3)).toHaveLength(4)
  })
})
