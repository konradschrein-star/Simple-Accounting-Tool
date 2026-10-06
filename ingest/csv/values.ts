import { roundHalfAwayFromZero } from "@/lib/money"
import type { DateFormat } from "./types"

const DATE_RE = /^(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})/

/** Parses a bank date in the given field order; two-digit years are 20xx. */
export function parseBankDate(value: string, format: DateFormat): string | null {
  const m = DATE_RE.exec(value.trim())
  if (!m) return null
  const [rawYear, mo, d] = format === "ymd" ? [m[1], m[2], m[3]] : format === "dmy" ? [m[3], m[2], m[1]] : [m[3], m[1], m[2]]
  const y = rawYear.length === 2 ? `20${rawYear}` : rawYear
  if (y.length !== 4) return null
  const year = Number(y)
  const month = Number(mo)
  const day = Number(d)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`
}

export function looksLikeDate(value: string): boolean {
  return DATE_RE.test(value.trim())
}

/** Infers field order from sample values; `ambiguous` when no component ever exceeds 12. */
export function inferDateFormat(values: string[], fallback: DateFormat): { format: DateFormat; ambiguous: boolean } {
  let first = false
  let second = false
  for (const v of values) {
    const m = DATE_RE.exec(v.trim())
    if (!m) continue
    if (m[1].length === 4) return { format: "ymd", ambiguous: false }
    if (Number(m[1]) > 12) first = true
    if (Number(m[2]) > 12) second = true
  }
  if (first && !second) return { format: "dmy", ambiguous: false }
  if (second && !first) return { format: "mdy", ambiguous: false }
  return { format: fallback, ambiguous: true }
}

const NUMBER_RE = /^[(+-]?[\d.,'\s]+\)?\s*-?$/

function cleanNumber(value: string): string {
  return value.replace(/[\s '€£$]|EUR|GBP|USD/g, "")
}

export function looksNumeric(value: string): boolean {
  const v = cleanNumber(value)
  return v !== "" && /\d/.test(v) && NUMBER_RE.test(v)
}

/** Decimal separator inferred from how numbers end ("12,50" vs "12.50"). */
export function inferDecimal(values: string[], fallback: "." | ","): "." | "," {
  let comma = 0
  let dot = 0
  for (const raw of values) {
    const v = cleanNumber(raw)
    if (/,\d{1,2}\)?-?$/.test(v)) comma++
    else if (/\.\d{1,2}\)?-?$/.test(v)) dot++
  }
  return comma === dot ? fallback : comma > dot ? "," : "."
}

/** Parses a bank amount to signed minor units. Handles "1.234,56", "(12.00)", "12,00-" and currency symbols. */
export function parseBankAmount(value: string, decimal: "." | ","): number | null {
  let v = cleanNumber(value)
  if (!v) return null
  let negative = false
  if (/^\(.*\)$/.test(v)) {
    negative = true
    v = v.slice(1, -1)
  }
  if (v.endsWith("-")) {
    negative = true
    v = v.slice(0, -1)
  }
  if (v.startsWith("-")) {
    negative = !negative
    v = v.slice(1)
  } else if (v.startsWith("+")) v = v.slice(1)
  const thousands = decimal === "," ? "." : ","
  v = v.split(thousands).join("").replace(decimal, ".")
  if (!/^\d+(\.\d+)?$/.test(v)) return null
  const minor = roundHalfAwayFromZero(Number(v) * 100)
  return negative ? -minor : minor
}

export function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/["*]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

const DEBIT_TOKENS = new Set(["s", "soll", "dr", "debit", "d", "-", "out"])

export function isDebitIndicator(value: string): boolean {
  return DEBIT_TOKENS.has(value.trim().toLowerCase())
}
