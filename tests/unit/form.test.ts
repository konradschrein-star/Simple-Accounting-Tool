import { describe, expect, it } from "vitest"
import { reminderDays } from "@/lib/form"

describe("reminder days", () => {
  it("accepts spaces, commas and semicolons, deduplicates and sorts", () => {
    expect(reminderDays.parse("21 7, 35;7")).toEqual([7, 21, 35])
    expect(reminderDays.parse("  ")).toEqual([])
  })
  it("rejects nonsense and more than five reminders", () => {
    expect(reminderDays.safeParse("7 days").success).toBe(false)
    expect(reminderDays.safeParse("0").success).toBe(false)
    expect(reminderDays.safeParse("1 2 3 4 5 6").success).toBe(false)
  })
})
