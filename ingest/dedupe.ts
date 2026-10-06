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
