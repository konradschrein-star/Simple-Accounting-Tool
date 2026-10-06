import type { IsoDate } from "@/lib/dates"

export type OpenInvoice = { id: string; number: string; openMinor: number; issueDate: IsoDate }
export type IncomingPayment = { date: IsoDate; amountMinor: number; text: string }

const compact = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "")

/**
 * Which open invoice a bank credit pays, if any. A payment reference naming the invoice wins and may be a part
 * payment; otherwise the amount must equal exactly what is still open. Each invoice is matched at most once per
 * statement (`claimed`), and never by a payment dated before the invoice was issued.
 */
export function matchPayment(payment: IncomingPayment, candidates: OpenInvoice[], claimed: Set<string>): OpenInvoice | null {
  if (payment.amountMinor <= 0) return null
  const available = candidates.filter((c) => !claimed.has(c.id) && c.openMinor > 0 && c.issueDate <= payment.date)
  const reference = compact(payment.text)
  const named = available.find((c) => reference.includes(compact(c.number)) && payment.amountMinor <= c.openMinor)
  return named ?? available.find((c) => c.openMinor === payment.amountMinor) ?? null
}
