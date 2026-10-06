import { createHash } from "node:crypto"

export function normalizeDescription(description: string): string {
  return description.toLowerCase().replace(/[^a-z0-9äöüß]+/g, " ").trim()
}

/**
 * Stable identity for a bank line. `occurrence` distinguishes genuinely repeated lines inside one statement
 * (two identical €4.50 coffees on the same day) while still catching the same statement imported twice.
 */
export function dedupeHashes(rows: { date: string; amountMinor: number; description: string }[]): string[] {
  const seen = new Map<string, number>()
  return rows.map((row) => {
    const key = `${row.date}|${row.amountMinor}|${normalizeDescription(row.description)}`
    const occurrence = seen.get(key) ?? 0
    seen.set(key, occurrence + 1)
    return createHash("sha256").update(`${key}|${occurrence}`).digest("hex")
  })
}

/** Hashes every bookable row (date + amount present) in statement order; staging and commit must agree on this. */
export function hashBankRows<T extends { date: string | null; amountMinor: number | null; description: string }>(rows: T[]): Map<T, string> {
  const bookable = rows.filter((r) => r.date && r.amountMinor !== null)
  const hashes = dedupeHashes(bookable.map((r) => ({ date: r.date!, amountMinor: r.amountMinor!, description: r.description })))
  return new Map(bookable.map((r, i) => [r, hashes[i]]))
}
