import { electronicFormatIBAN, isValidBIC, isValidIBAN } from "ibantools"
import { checkVAT, countries } from "jsvat"

/**
 * Checksum validation for the identifiers printed on invoices. A typo here means unpaid invoices
 * (wrong IBAN) or rejected input-tax claims (wrong VAT ID), so we catch it at entry. Empty is always fine.
 */

export function ibanProblem(value: string): string | null {
  if (!value.trim()) return null
  return isValidIBAN(electronicFormatIBAN(value) ?? "") ? null : "That IBAN doesn’t check out — please look for a typo."
}

export function bicProblem(value: string): string | null {
  if (!value.trim()) return null
  return isValidBIC(value.replace(/\s+/g, "").toUpperCase()) ? null : "That BIC / SWIFT code doesn’t look right (8 or 11 characters)."
}

/** EU, UK and Swiss VAT numbers are verified by checksum; formats we don't know (e.g. Jersey GST) pass. */
export function vatIdProblem(value: string): string | null {
  const compact = value.replace(/[\s.-]+/g, "").toUpperCase()
  if (!compact) return null
  if (!/^[A-Z]{2}/.test(compact)) return "VAT IDs start with the country code, e.g. DE123456789 or GB123456789."
  const result = checkVAT(compact, countries)
  if (!result.isSupportedCountry) return null
  return result.isValid ? null : "That VAT ID doesn’t pass the official checksum — please check it."
}

export function sortCodeProblem(value: string): string | null {
  if (!value.trim()) return null
  return /^\d{2}-?\d{2}-?\d{2}$/.test(value.trim()) ? null : "Sort codes have six digits, e.g. 20-00-00."
}

/** UK accounts have 8 digits, US accounts 4–17; the field serves both. */
export function accountNumberProblem(value: string): string | null {
  if (!value.trim()) return null
  return /^\d{4,17}$/.test(value.replace(/[\s-]+/g, "")) ? null : "Account numbers are digits only (UK: 8 digits)."
}

/** ABA routing numbers carry a weighted mod-10 checksum (3-7-1). */
export function routingNumberProblem(value: string): string | null {
  const digits = value.replace(/\s+/g, "")
  if (!digits) return null
  if (!/^\d{9}$/.test(digits)) return "Routing numbers have nine digits."
  const d = digits.split("").map(Number)
  const sum = 3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8])
  return sum % 10 === 0 ? null : "That routing number doesn’t pass its checksum — please check it."
}
