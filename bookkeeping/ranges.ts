import { addDays, type IsoDate } from "@/lib/dates"

export const RANGE_KEYS = ["month", "last_month", "quarter", "ytd", "ttm"] as const
export type RangeKey = (typeof RANGE_KEYS)[number]

export const RANGE_LABELS: Record<RangeKey, string> = {
  month: "This month",
  last_month: "Last month",
  quarter: "This quarter",
  ytd: "Year to date",
  ttm: "Last 12 months",
}

const monthStart = (y: number, m: number) => new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10)

/** Reporting window plus the equally long window right before it (for comparison). */
export function reportRange(key: RangeKey, today: IsoDate): { period: { from: IsoDate; to: IsoDate }; prior: { from: IsoDate; to: IsoDate } } {
  const [y, m] = today.split("-").map(Number)
  const span = (from: IsoDate, to: IsoDate, priorFrom: IsoDate) => ({ period: { from, to }, prior: { from: priorFrom, to: addDays(from, -1) } })
  switch (key) {
    case "month":
      return span(monthStart(y, m), today, monthStart(y, m - 1))
    case "last_month":
      return span(monthStart(y, m - 1), addDays(monthStart(y, m), -1), monthStart(y, m - 2))
    case "quarter": {
      const q = Math.floor((m - 1) / 3) * 3 + 1
      return span(monthStart(y, q), today, monthStart(y, q - 3))
    }
    case "ytd":
      return span(`${y}-01-01`, today, `${y - 1}-01-01`)
    case "ttm":
      return span(monthStart(y, m - 11), today, monthStart(y, m - 23))
  }
}
