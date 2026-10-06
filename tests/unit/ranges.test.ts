import { describe, expect, it } from "vitest"
import { parseRangeKey, reportRange } from "@/bookkeeping/ranges"

describe("report ranges compare like with like", () => {
  const today = "2026-10-06"
  it("month-to-date vs the same days last month", () => {
    expect(reportRange("month", today)).toEqual({ period: { from: "2026-10-01", to: "2026-10-06" }, prior: { from: "2026-09-01", to: "2026-09-06" } })
  })
  it("last full month vs the month before", () => {
    expect(reportRange("last_month", today)).toEqual({ period: { from: "2026-09-01", to: "2026-09-30" }, prior: { from: "2026-08-01", to: "2026-08-31" } })
  })
  it("quarter-to-date vs the same span of the previous quarter", () => {
    expect(reportRange("quarter", today)).toEqual({ period: { from: "2026-10-01", to: "2026-10-06" }, prior: { from: "2026-07-01", to: "2026-07-06" } })
  })
  it("YTD vs the same days last year", () => {
    expect(reportRange("ytd", today).prior).toEqual({ from: "2025-01-01", to: "2025-10-06" })
  })
  it("parses unknown keys to the fallback", () => {
    expect(parseRangeKey("nope")).toBe("ytd")
  })
})
