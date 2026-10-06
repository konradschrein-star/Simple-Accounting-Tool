import type { IsoDate } from "@/lib/dates"

export type OpenInvoice = { id: string; number: string; openMinor: number; issueDate: IsoDate }
export type IncomingPayment = { date: IsoDate; amountMinor: number; text: string }

/**
 * Whether a payment reference names this invoice number as a whole token. Separators may differ ("INV-2026-0001",
 * "INV 2026 0001", "INV2026/0001"), but digits may not run on: INV-2026-0001 never matches INV-2026-00012.
 */
export function referencesNumber(text: string, number: string): boolean {
  const segments = number.toUpperCase().match(/[A-Z0-9]+/g)
  if (!segments) return false
  const pattern = new RegExp(`(^|[^A-Z0-9])${segments.join("[^A-Z0-9]*")}($|[^A-Z0-9])`)
  return pattern.test(text.toUpperCase())
}

/**
 * Which open invoice a bank credit pays, if any. A payment reference naming the invoice wins and may be a part
 * payment (the longest matching number wins); otherwise the amount must equal exactly what is still open. Each invoice
 * is matched at most once per statement (`claimed`), and never by a payment dated before the invoice was issued.
 */
export function matchPayment(payment: IncomingPayment, candidates: OpenInvoice[], claimed: Set<string>): OpenInvoice | null {
  if (payment.amountMinor <= 0) return null
  const available = candidates.filter((c) => !claimed.has(c.id) && c.openMinor > 0 && c.issueDate <= payment.date)
  const named = available
    .filter((c) => payment.amountMinor <= c.openMinor && referencesNumber(payment.text, c.number))
    .sort((a, b) => b.number.length - a.number.length)[0]
  return named ?? available.find((c) => c.openMinor === payment.amountMinor) ?? null
}
