import { monthKey, monthRange, shiftMonths, type IsoDate } from "@/lib/dates"

export const RANGE_KEYS = ["month", "last_month", "quarter", "ytd", "ttm"] as const
export type RangeKey = (typeof RANGE_KEYS)[number]

export const RANGE_LABELS: Record<RangeKey, string> = {
  month: "This month",
  last_month: "Last month",
  quarter: "This quarter",
  ytd: "Year to date",
  ttm: "Last 12 months",
}

export function parseRangeKey(value: string | null | undefined, fallback: RangeKey = "ytd"): RangeKey {
  return RANGE_KEYS.includes(value as RangeKey) ? (value as RangeKey) : fallback
}

type Span = { from: IsoDate; to: IsoDate }

/**
 * Reporting window plus a like-for-like comparison: the same span shifted back by one period
 * (month-to-date vs. the same days last month, YTD vs. the same days last year).
 */
export function reportRange(key: RangeKey, today: IsoDate): { period: Span; prior: Span } {
  const month = monthKey(today)
  const shifted = (period: Span, months: number) => ({ period, prior: { from: shiftMonths(period.from, -months), to: shiftMonths(period.to, -months) } })
  switch (key) {
    case "month":
      return shifted({ from: monthRange(month).from, to: today }, 1)
    case "last_month": {
      const last = monthRange(shiftMonths(today, -1).slice(0, 7))
      return { period: last, prior: monthRange(shiftMonths(last.from, -1).slice(0, 7)) }
    }
    case "quarter": {
      const m = Number(today.slice(5, 7))
      const start = `${today.slice(0, 4)}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, "0")}-01`
      return shifted({ from: start, to: today }, 3)
    }
    case "ytd":
      return shifted({ from: `${today.slice(0, 4)}-01-01`, to: today }, 12)
    case "ttm":
      return shifted({ from: monthRange(shiftMonths(today, -11).slice(0, 7)).from, to: today }, 12)
  }
}
