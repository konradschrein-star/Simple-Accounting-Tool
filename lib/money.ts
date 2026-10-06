/** Money is always integer minor units (cents/pence). Rates are basis points (1900 = 19%). Quantities are milli-units. */

export type CurrencyCode = "EUR" | "GBP" | "USD"

/** Round half away from zero — the commercial rounding used on invoices. */
export function roundHalfAwayFromZero(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value))
}

export function lineNetMinor(quantityMilli: number, unitPriceMinor: number): number {
  return roundHalfAwayFromZero((quantityMilli * unitPriceMinor) / 1000)
}

export function taxOnNetMinor(netMinor: number, rateBp: number): number {
  return roundHalfAwayFromZero((netMinor * rateBp) / 10000)
}

export type TaxGroup = { rateBp: number; netMinor: number; taxMinor: number }

export type InvoiceTotals = {
  subtotalMinor: number
  taxMinor: number
  totalMinor: number
  taxGroups: TaxGroup[]
}

/** Tax is computed per rate group on the summed nets (not per line) — required for DE/UK compliant breakdowns. */
export function computeTotals(
  lines: { quantityMilli: number; unitPriceMinor: number; taxRateBp: number }[],
): InvoiceTotals {
  const groups = new Map<number, number>()
  let subtotalMinor = 0
  for (const line of lines) {
    const net = lineNetMinor(line.quantityMilli, line.unitPriceMinor)
    subtotalMinor += net
    groups.set(line.taxRateBp, (groups.get(line.taxRateBp) ?? 0) + net)
  }
  const taxGroups = [...groups.entries()]
    .sort(([a], [b]) => b - a)
    .map(([rateBp, netMinor]) => ({ rateBp, netMinor, taxMinor: taxOnNetMinor(netMinor, rateBp) }))
  const taxMinor = taxGroups.reduce((sum, g) => sum + g.taxMinor, 0)
  return { subtotalMinor, taxMinor, totalMinor: subtotalMinor + taxMinor, taxGroups }
}

export function formatMoney(minor: number, currency: CurrencyCode, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(minor / 100)
}

export function formatRate(rateBp: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(rateBp / 100) + " %"
}

/** Converts a user-entered decimal ("1234.5", "1.234,50") to minor units. Returns null when unparseable. */
export function parseDecimalToMinor(input: string, decimalSeparator: "." | "," = "."): number | null {
  const thousands = decimalSeparator === "." ? /,/g : /\./g
  const cleaned = input
    .trim()
    .replace(/[\s' €£$]/g, "")
    .replace(thousands, "")
    .replace(decimalSeparator, ".")
  if (!/^[-+]?\d+(\.\d+)?$/.test(cleaned)) return null
  return roundHalfAwayFromZero(Number(cleaned) * 100)
}

export const toMinor = (major: number) => roundHalfAwayFromZero(major * 100)
export const toMilli = (qty: number) => roundHalfAwayFromZero(qty * 1000)
