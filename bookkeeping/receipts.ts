import { z } from "zod"
import { daysBetween, type IsoDate } from "@/lib/dates"

/** What the model reads off a receipt or supplier invoice. Amounts as printed, in major units. */
export const receiptExtractionSchema = z.object({
  vendor: z.string().nullable(),
  date: z.string().nullable().describe("Invoice/receipt date as YYYY-MM-DD"),
  total: z.number().nullable().describe("Grand total including tax"),
  tax: z.number().nullable().describe("Total VAT/GST/sales tax amount, 0 if none shown"),
  currency: z.string().nullable().describe("ISO 4217 code, e.g. EUR"),
  invoiceNumber: z.string().nullable(),
})
export type ReceiptExtraction = z.infer<typeof receiptExtractionSchema>

export type ReceiptData = { vendor: string | null; date: IsoDate | null; totalMinor: number | null; vatMinor: number | null; currency: string | null; invoiceNumber?: string | null }

export const RECEIPT_PROMPT = [
  "You read receipts and supplier invoices for bookkeeping.",
  "Return the vendor (the business that issued it), the document date, the grand total including tax, the total tax amount, the currency and the invoice number.",
  "Copy values exactly as printed; use null for anything not visible. Dates as YYYY-MM-DD. Amounts as plain numbers (12.50), positive.",
].join(" ")

const toMinor = (value: number | null) => (value === null || !Number.isFinite(value) ? null : Math.round(Math.abs(value) * 100))

/** Normalizes model output; drops values that cannot be right instead of trusting them. */
export function normalizeReceipt(raw: ReceiptExtraction): ReceiptData {
  const date = raw.date && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : null
  const totalMinor = toMinor(raw.total)
  let vatMinor = toMinor(raw.tax)
  if (vatMinor !== null && totalMinor !== null && vatMinor >= totalMinor) vatMinor = null
  const currency = raw.currency && /^[A-Z]{3}$/.test(raw.currency.trim().toUpperCase()) ? raw.currency.trim().toUpperCase() : null
  return { vendor: raw.vendor?.trim() || null, date, totalMinor, vatMinor, currency, invoiceNumber: raw.invoiceNumber?.trim() || null }
}

/**
 * The VAT rate a receipt implies (tax ÷ net), snapped to a rate the jurisdiction actually has.
 * Mixed-rate receipts don't snap and return null — the account default then applies.
 */
export function impliedVatRate(totalMinor: number | null, vatMinor: number | null, ratesBp: number[]): number | null {
  if (totalMinor === null || vatMinor === null || totalMinor <= 0) return null
  if (vatMinor === 0) return 0
  const net = totalMinor - vatMinor
  if (net <= 0) return null
  const rate = (vatMinor / net) * 10_000
  const nearest = ratesBp.filter((r) => r > 0).sort((a, b) => Math.abs(a - rate) - Math.abs(b - rate))[0]
  // Rounding on small receipts moves the ratio a little; anything further off is a mixed-rate receipt.
  return nearest !== undefined && Math.abs(nearest - rate) <= 60 ? nearest : null
}

export type CandidateTransaction = { id: string; date: IsoDate; amountMinor: number; description: string; counterparty: string }

const words = (text: string) => new Set(text.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").split(" ").filter((w) => w.length >= 3))

/**
 * Best bank transaction for a receipt: same amount (money out), paid within two weeks of the receipt date
 * (cards book a day or two later, transfers up to the due date), vendor name in the booking text as tie-breaker.
 */
export function suggestTransaction(receipt: ReceiptData, candidates: CandidateTransaction[]): CandidateTransaction | null {
  if (receipt.totalMinor === null) return null
  const vendorWords = words(receipt.vendor ?? "")
  const scored = candidates
    .filter((t) => t.amountMinor === -receipt.totalMinor!)
    .map((t) => {
      const gap = receipt.date ? Math.abs(daysBetween(receipt.date, t.date)) : 0
      const text = words(`${t.counterparty} ${t.description}`)
      const vendorHit = [...vendorWords].some((w) => text.has(w))
      return { t, gap, score: (vendorHit ? 100 : 0) - gap }
    })
    .filter((s) => !receipt.date || s.gap <= 14 || s.score >= 100 - 30)
    .sort((a, b) => b.score - a.score)
  return scored[0]?.t ?? null
}
