import type { Reconciliation, RowIssue } from "@/db/schema"

export type VerifiableRow = { amountMinor: number | null; balanceMinor: number | null; amountText?: string; issues: RowIssue[] }

const TOLERANCE = 1 // one minor unit of rounding noise

/**
 * Running-balance check. Statements are printed oldest-first or newest-first; whichever direction
 * explains more rows is used, and only rows that break the chain in that direction are flagged.
 */
export function flagBalanceBreaks<T extends VerifiableRow>(rows: T[]): T[] {
  const breaks = (direction: 1 | -1) => {
    const flagged = new Set<number>()
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1]
      const cur = rows[i]
      if (prev.balanceMinor === null || cur.balanceMinor === null || cur.amountMinor === null || prev.amountMinor === null) continue
      const expected = direction === 1 ? prev.balanceMinor + cur.amountMinor : prev.balanceMinor - prev.amountMinor
      if (Math.abs(expected - cur.balanceMinor) > TOLERANCE) flagged.add(i)
    }
    return flagged
  }
  const forward = breaks(1)
  const backward = breaks(-1)
  const flagged = backward.size < forward.size ? backward : forward
  return rows.map((row, i) => (flagged.has(i) && !row.issues.includes("balance_mismatch") ? { ...row, issues: [...row.issues, "balance_mismatch"] } : row))
}

/** Statement-level check: opening + Σ movements must equal closing. `ok` is null when the statement prints no balances. */
export function reconcile(rows: VerifiableRow[], openingMinor: number | null, closingMinor: number | null): Reconciliation {
  const computedDeltaMinor = rows.reduce((sum, r) => sum + (r.amountMinor ?? 0), 0)
  const ok = openingMinor === null || closingMinor === null ? null : Math.abs(openingMinor + computedDeltaMinor - closingMinor) <= TOLERANCE
  return { openingMinor, closingMinor, computedDeltaMinor, ok }
}

/** Hallucination guard for text-layer extraction: the printed amount must literally occur on the page. */
export function flagUnsupportedAmounts<T extends VerifiableRow>(rows: T[], pageText: string): T[] {
  const haystack = pageText.replace(/\s+/g, "")
  return rows.map((row) => {
    const needle = (row.amountText ?? "").replace(/\s+/g, "").replace(/^[+-]|[+-]$/g, "")
    if (!needle || haystack.includes(needle) || row.issues.includes("low_confidence")) return row
    return { ...row, issues: [...row.issues, "low_confidence"] }
  })
}

/** Lower is better: used to choose between a primary and an escalated extraction. */
export function extractionPenalty(rows: VerifiableRow[], reconciliation: Reconciliation): number {
  const flagged = rows.filter((r) => r.issues.length > 0).length
  return (reconciliation.ok === false ? 1000 : 0) + flagged
}
