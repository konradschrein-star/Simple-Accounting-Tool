import { z } from "zod"

/** HTML checkbox / Radix switch value in FormData. */
export const checkbox = z.preprocess((v) => v === "on" || v === "true", z.boolean())
export const text = (max = 200) => z.string().trim().max(max).default("")

/** "7, 21 35" → [7, 21, 35]: up to five distinct days after the due date, ascending. */
export const reminderDays = z
  .string()
  .transform((v) =>
    [
      ...new Set(
        v
          .split(/[\s,;]+/)
          .filter(Boolean)
          .map(Number)
      ),
    ].sort((a, b) => a - b)
  )
  .pipe(z.array(z.number().int().min(1, "Reminder days must be at least 1").max(365)).max(5, "At most 5 reminders"))
