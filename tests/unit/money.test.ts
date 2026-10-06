import { describe, expect, it } from "vitest"
import { computeTotals, lineNetMinor, parseDecimalToMinor, roundHalfAwayFromZero } from "@/lib/money"

describe("money", () => {
  it("rounds half away from zero", () => {
    expect(roundHalfAwayFromZero(2.5)).toBe(3)
    expect(roundHalfAwayFromZero(-2.5)).toBe(-3)
    expect(roundHalfAwayFromZero(2.4999)).toBe(2)
  })

  it("computes line nets from milli quantities", () => {
    expect(lineNetMinor(1500, 999)).toBe(1499) // 1.5 × 9.99 = 14.985 → 14.99
    expect(lineNetMinor(1000, 12345)).toBe(12345)
  })

  it("groups tax per rate on summed nets (DE mixed 19% / 7%)", () => {
    const totals = computeTotals([
      { quantityMilli: 1000, unitPriceMinor: 333, taxRateBp: 1900 },
      { quantityMilli: 1000, unitPriceMinor: 333, taxRateBp: 1900 },
      { quantityMilli: 2000, unitPriceMinor: 1000, taxRateBp: 700 },
    ])
    // per-line rounding would give 63+63=126; summed net 666 × 19% = 126.54 → 127
    expect(totals.taxGroups).toEqual([
      { rateBp: 1900, netMinor: 666, taxMinor: 127 },
      { rateBp: 700, netMinor: 2000, taxMinor: 140 },
    ])
    expect(totals).toMatchObject({ subtotalMinor: 2666, taxMinor: 267, totalMinor: 2933 })
  })

  it("parses user decimals in both conventions", () => {
    expect(parseDecimalToMinor("1.234,56", ",")).toBe(123456)
    expect(parseDecimalToMinor("-1,234.56", ".")).toBe(-123456)
    expect(parseDecimalToMinor("€ 12,5", ",")).toBe(1250)
    expect(parseDecimalToMinor("abc")).toBeNull()
  })
})

describe("dates & percent helpers", async () => {
  const { addMonths, monthRange, shiftMonths } = await import("@/lib/dates")
  const { parsePercentInput } = await import("@/lib/money")
  const { toCsv } = await import("@/lib/csv")
  it("month arithmetic", () => {
    expect(addMonths("2026-01", -1)).toBe("2025-12")
    expect(monthRange("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" })
    expect(shiftMonths("2026-03-31", -1)).toBe("2026-02-28")
  })
  it("percent input", () => {
    expect(parsePercentInput("7.25")).toBe(725)
    expect(parsePercentInput("19 %")).toBe(1900)
    expect(parsePercentInput("abc")).toBeNull()
  })
  it("csv neutralises formulas", () => {
    expect(toCsv([["=HYPERLINK(1)", 5]])).toBe('﻿"\'=HYPERLINK(1)",5')
  })
})
