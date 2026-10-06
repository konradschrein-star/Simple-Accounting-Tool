import { describe, expect, it } from "vitest"
import { dedupeHashes } from "@/ingest/dedupe"
import { extractionPenalty, flagBalanceBreaks, flagUnsupportedAmounts, reconcile } from "@/ingest/verify"

const row = (amountMinor: number, balanceMinor: number | null, amountText = "") => ({ amountMinor, balanceMinor, amountText, issues: [] as never[] })

describe("statement verification", () => {
  it("accepts a consistent oldest-first running balance", () => {
    const rows = flagBalanceBreaks([row(-1000, 9000), row(5000, 14000), row(-250, 13750)])
    expect(rows.every((r) => r.issues.length === 0)).toBe(true)
  })

  it("accepts newest-first statements", () => {
    const rows = flagBalanceBreaks([row(-250, 13750), row(5000, 14000), row(-1000, 9000)])
    expect(rows.every((r) => r.issues.length === 0)).toBe(true)
  })

  it("flags the row where a sign or digit was misread", () => {
    const rows = flagBalanceBreaks([row(-1000, 9000), row(-5000, 14000), row(-250, 13750)])
    expect(rows.map((r) => r.issues)).toEqual([[], ["balance_mismatch"], []])
  })

  it("reconciles opening + movements = closing", () => {
    const rows = [row(-1000, null), row(5000, null)]
    expect(reconcile(rows, 10000, 14000)).toEqual({ openingMinor: 10000, closingMinor: 14000, computedDeltaMinor: 4000, ok: true })
    expect(reconcile(rows, 10000, 15000).ok).toBe(false)
    expect(reconcile(rows, null, null).ok).toBeNull()
  })

  it("flags amounts that do not occur in the source text", () => {
    const rows = flagUnsupportedAmounts([row(-6645, null, "-66,45"), row(-9999, null, "99,99")], "02.10. ADOBE   66,45-\n")
    expect(rows.map((r) => r.issues)).toEqual([[], ["low_confidence"]])
  })

  it("prefers extractions that reconcile", () => {
    const good = [row(100, null)]
    expect(extractionPenalty(good, reconcile(good, 0, 100))).toBeLessThan(extractionPenalty(good, reconcile(good, 0, 200)))
  })
})

describe("dedupe hashing", () => {
  it("keeps repeated identical lines distinct but stable across imports", () => {
    const rows = [
      { date: "2026-10-01", amountMinor: -450, description: "Coffee" },
      { date: "2026-10-01", amountMinor: -450, description: "COFFEE " },
    ]
    const first = dedupeHashes(rows)
    expect(first[0]).not.toBe(first[1])
    expect(dedupeHashes(rows)).toEqual(first)
  })
})
