import { electronicFormatIBAN, friendlyFormatIBAN, isValidBIC, isValidIBAN } from "ibantools"
import { checkVAT, countries } from "jsvat"
import { z } from "zod"

/**
 * The identifiers printed on invoices, checked by checksum and stored in their canonical form. A typo here means
 * unpaid invoices (wrong IBAN) or rejected input-tax claims (wrong VAT ID), so we catch it at entry. Empty is fine.
 */

/** A form field that accepts an identifier as people type it and yields its canonical form (or ""). */
function identifier(canonical: (value: string) => string, problem: (canonical: string) => string | null) {
  return z
    .string()
    .default("")
    .transform((raw, ctx) => {
      const value = canonical(raw.trim())
      if (!value) return ""
      const message = problem(value)
      if (message) ctx.addIssue({ code: "custom", message })
      return value
    })
}

const compact = (pattern: RegExp) => (value: string) => value.replace(pattern, "").toUpperCase()

export const ibanField = identifier(
  (v) => electronicFormatIBAN(v) ?? "",
  (v) => (isValidIBAN(v) ? null : "That IBAN doesn’t check out — please look for a typo.")
)

export const bicField = identifier(compact(/\s+/g), (v) => (isValidBIC(v) ? null : "That BIC / SWIFT code doesn’t look right (8 or 11 characters)."))

/** EU, UK and Swiss VAT numbers are verified by checksum; formats we don't know (e.g. Jersey GST) pass. */
export const vatIdField = identifier(compact(/[\s.-]+/g), (v) => {
  if (!/^[A-Z]{2}/.test(v)) return "VAT IDs start with the country code, e.g. DE123456789 or GB123456789."
  const result = checkVAT(v, countries)
  return !result.isSupportedCountry || result.isValid ? null : "That VAT ID doesn’t pass the official checksum — please check it."
})

/** Stored as 20-00-00. */
export const sortCodeField = identifier(
  (v) => {
    const digits = v.replace(/[\s-]+/g, "")
    return /^\d{6}$/.test(digits) ? `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}` : v
  },
  (v) => (/^\d{2}-\d{2}-\d{2}$/.test(v) ? null : "Sort codes have six digits, e.g. 20-00-00.")
)

/** UK accounts have 8 digits, US accounts 4–17; the field serves both. */
export const accountNumberField = identifier(compact(/[\s-]+/g), (v) => (/^\d{4,17}$/.test(v) ? null : "Account numbers are digits only (UK: 8 digits)."))

/** ABA routing numbers carry a weighted mod-10 checksum (3-7-1). */
export const routingNumberField = identifier(compact(/\s+/g), (v) => {
  if (!/^\d{9}$/.test(v)) return "Routing numbers have nine digits."
  const d = v.split("").map(Number)
  const sum = 3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8])
  return sum % 10 === 0 ? null : "That routing number doesn’t pass its checksum — please check it."
})

/** IBANs are stored compact and printed in groups of four, as banks do. */
export const displayIban = (iban: string) => friendlyFormatIBAN(iban) ?? iban
