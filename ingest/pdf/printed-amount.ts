import { inferDecimal, parseBankAmount } from "@/ingest/csv/values"

/** Sign conventions printed on statements: "-12,00", "12,00-", "(12.00)", "12,00 S"/"H" (Soll/Haben), "12.00 DR"/"CR". */
const DEBIT_SUFFIX = /\s*(S|DR|Soll|D)$/i
const CREDIT_SUFFIX = /\s*(H|CR|Haben|C)$/i

export type PrintedAmount = { magnitudeMinor: number | null; sign: -1 | 1 | null }

export function parsePrintedAmount(text: string, decimal: "." | ","): PrintedAmount {
  let t = text
    .replace(/−/g, "-")
    .replace(/[€£$]|EUR|GBP|USD/g, "")
    .trim()
  let sign: -1 | 1 | null = null
  if (DEBIT_SUFFIX.test(t)) {
    sign = -1
    t = t.replace(DEBIT_SUFFIX, "")
  } else if (CREDIT_SUFFIX.test(t)) {
    sign = 1
    t = t.replace(CREDIT_SUFFIX, "")
  }
  const value = parseBankAmount(t, decimal)
  if (value === null) return { magnitudeMinor: null, sign }
  if (sign === null && (/^\s*[-(]/.test(t) || /-\s*$/.test(t))) sign = -1
  if (sign === null && /^\s*\+/.test(t)) sign = 1
  return { magnitudeMinor: Math.abs(value), sign }
}

/** Decimal separator for a whole statement, inferred from all printed amounts at once. */
export function statementDecimal(texts: string[]): "." | "," {
  return inferDecimal(
    texts.map((t) => t.replace(/\s*(S|H|DR|CR|Soll|Haben)$/i, "")),
    ","
  )
}

const SYMBOLS: Record<string, string> = { "€": "EUR", "£": "GBP", $: "USD" }

/** ISO 4217 code from whatever the model returned ("EUR", "€", "eur"), or null. */
export function normalizeCurrency(value: string | null | undefined): string | null {
  if (!value) return null
  const v = value.trim()
  const code = SYMBOLS[v] ?? v.toUpperCase()
  return /^[A-Z]{3}$/.test(code) ? code : null
}
