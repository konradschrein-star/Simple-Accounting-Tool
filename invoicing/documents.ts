import type { DOCUMENT_STATUSES } from "@/db/schema"
import type { IsoDate } from "@/lib/dates"

export type DocumentKind = "invoice" | "quote" | "credit_note"
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number]

/** What the user sees. Derived from stored status + dates + payments, never stored, so it can't go stale. */
export type DisplayStatus =
  | "draft"
  | "open"
  | "partial"
  | "overdue"
  | "paid"
  | "void"
  | "cancelled"
  | "sent"
  | "accepted"
  | "declined"
  | "converted"
  | "expired"
  | "issued"

export function displayStatus(doc: { kind: DocumentKind; status: DocumentStatus; dueDate: IsoDate; totalMinor: number }, today: IsoDate, paidMinor = 0): DisplayStatus {
  if (doc.status === "draft") return "draft"
  if (doc.kind === "credit_note") return "issued"
  if (doc.kind === "quote") {
    if (doc.status === "finalized") return doc.dueDate < today ? "expired" : "sent"
    return doc.status === "accepted" || doc.status === "declined" || doc.status === "converted" ? doc.status : "sent"
  }
  if (doc.status === "finalized") {
    if (doc.dueDate < today) return "overdue"
    return paidMinor > 0 ? "partial" : "open"
  }
  return doc.status === "paid" || doc.status === "void" || doc.status === "cancelled" ? doc.status : "open"
}

/** Each kind has its own gap-free number range. */
export const NUMBERING = {
  invoice: { prefix: "invoicePrefix", seq: "nextInvoiceSeq" },
  quote: { prefix: "quotePrefix", seq: "nextQuoteSeq" },
  credit_note: { prefix: "creditNotePrefix", seq: "nextCreditNoteSeq" },
} as const

export function formatDocumentNumber(prefix: string, year: number, seq: number): string {
  return `${prefix}${year}-${String(seq).padStart(4, "0")}`
}

export const KIND_LABELS: Record<DocumentKind, { singular: string; plural: string }> = {
  invoice: { singular: "Invoice", plural: "Invoices" },
  quote: { singular: "Quote", plural: "Quotes" },
  credit_note: { singular: "Credit note", plural: "Credit notes" },
}

/** Lines of a cancellation credit note (Stornorechnung): the original lines with negated quantities. */
export function reversalLines<T extends { quantityMilli: number }>(lines: T[]): T[] {
  return lines.map((l) => ({ ...l, quantityMilli: -l.quantityMilli }))
}

/** Amount still owed on an invoice after recorded payments (never negative). */
export function openAmount(totalMinor: number, paidMinor: number): number {
  return Math.max(0, totalMinor - paidMinor)
}

/**
 * Next issue date of a recurring series. Month-based steps keep the day of month where possible
 * (31 Jan → 28/29 Feb → 31 Mar is avoided: we anchor on the original day each time).
 */
export function nextRecurrence(anchor: IsoDate, frequency: "weekly" | "monthly" | "quarterly" | "yearly", step: number): IsoDate {
  const [y, m, d] = anchor.split("-").map(Number)
  if (frequency === "weekly") {
    const date = new Date(Date.UTC(y, m - 1, d + 7 * step))
    return date.toISOString().slice(0, 10)
  }
  const months = frequency === "monthly" ? step : frequency === "quarterly" ? 3 * step : 12 * step
  const target = new Date(Date.UTC(y, m - 1 + months, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(d, lastDay))
  return target.toISOString().slice(0, 10)
}

/** Dunning level due for an overdue invoice, given the days-after-due schedule and levels already sent. */
export function dueReminderLevel(dueDate: IsoDate, today: IsoDate, scheduleDays: number[], sentLevels: number): number | null {
  const daysOverdue = Math.round((Date.parse(today) - Date.parse(dueDate)) / 86_400_000)
  const reached = scheduleDays.filter((d) => daysOverdue >= d).length
  return reached > sentLevels ? reached : null
}
