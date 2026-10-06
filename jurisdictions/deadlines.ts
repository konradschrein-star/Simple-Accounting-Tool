import type { IsoDate } from "@/lib/dates"
import type { TaxDeadline } from "./types"

/**
 * Runs a per-year generator over every year that can produce a deadline inside [from, to]
 * (deadlines can fall in the year after their period), then filters, de-duplicates and sorts.
 */
export function collectDeadlines(from: IsoDate, to: IsoDate, perYear: (year: number) => TaxDeadline[]): TaxDeadline[] {
  const firstYear = Number(from.slice(0, 4)) - 1
  const lastYear = Number(to.slice(0, 4))
  const byId = new Map<string, TaxDeadline>()
  for (let year = firstYear; year <= lastYear; year++) {
    for (const deadline of perYear(year)) {
      if (deadline.date >= from && deadline.date <= to) byId.set(deadline.id, deadline)
    }
  }
  return [...byId.values()].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
}

/** Quarter-end months for a stagger whose first quarter ends in `firstEndMonth` (1–3). */
export function quarterEndMonths(firstEndMonth: 1 | 2 | 3): number[] {
  return [0, 3, 6, 9].map((offset) => firstEndMonth + offset)
}

export const pad2 = (n: number) => String(n).padStart(2, "0")
