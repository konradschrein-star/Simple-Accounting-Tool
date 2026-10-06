import type { DOCUMENT_KINDS, DOCUMENT_STATUSES } from "@/db/schema"
import type { IsoDate } from "@/lib/dates"

/**
 * One table, four kinds. `recurring_template` is the editable model a recurring series copies — never issued,
 * never numbered, never listed among invoices — so no query has to remember to exclude it.
 */
export type DocumentKind = (typeof DOCUMENT_KINDS)[number]
/** Kinds that are issued to a client and get a number. */
export type IssuedKind = Exclude<DocumentKind, "recurring_template">
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number]

/** What the user sees. Derived from stored status + dates + payments, never stored, so it can't go stale. */
export type DisplayStatus =
  "draft" | "open" | "partial" | "overdue" | "paid" | "cancelled" | "sent" | "accepted" | "declined" | "converted" | "expired" | "issued"

export const STATUS_LABELS: Record<DisplayStatus, string> = {
  draft: "Draft",
  open: "Open",
  partial: "Part-paid",
  overdue: "Overdue",
  paid: "Paid",
  cancelled: "Cancelled",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
  converted: "Invoiced",
  expired: "Expired",
  issued: "Issued",
}

export function displayStatus(doc: { kind: DocumentKind; status: DocumentStatus; dueDate: IsoDate }, today: IsoDate, paidMinor = 0): DisplayStatus {
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
  return doc.status === "paid" || doc.status === "cancelled" ? doc.status : "open"
}

/** Each issued kind has its own gap-free number range. */
export const NUMBERING: Record<
  IssuedKind,
  { prefix: "invoicePrefix" | "quotePrefix" | "creditNotePrefix"; seq: "nextInvoiceSeq" | "nextQuoteSeq" | "nextCreditNoteSeq" }
> = {
  invoice: { prefix: "invoicePrefix", seq: "nextInvoiceSeq" },
  quote: { prefix: "quotePrefix", seq: "nextQuoteSeq" },
  credit_note: { prefix: "creditNotePrefix", seq: "nextCreditNoteSeq" },
}

export function formatDocumentNumber(prefix: string, year: number, seq: number): string {
  return `${prefix}${year}-${String(seq).padStart(4, "0")}`
}

export const KIND_LABELS: Record<DocumentKind, { singular: string; plural: string }> = {
  invoice: { singular: "Invoice", plural: "Invoices" },
  quote: { singular: "Quote", plural: "Quotes" },
  credit_note: { singular: "Credit note", plural: "Credit notes" },
  recurring_template: { singular: "Recurring invoice template", plural: "Recurring invoices" },
}

/** How a kind prints: a template previews as the invoice it will become. */
export const printedKind = (kind: DocumentKind): IssuedKind => (kind === "recurring_template" ? "invoice" : kind)

/** Lines of a cancellation credit note (Stornorechnung): the original lines with negated quantities. */
export function reversalLines<T extends { quantityMilli: number }>(lines: T[]): T[] {
  return lines.map((l) => ({ ...l, quantityMilli: -l.quantityMilli }))
}

/** Amount still owed on an invoice after recorded payments (never negative). */
export function openAmount(totalMinor: number, paidMinor: number): number {
  return Math.max(0, totalMinor - paidMinor)
}

export type Frequency = "weekly" | "monthly" | "quarterly" | "yearly"

/**
 * Issue date number `step` of a recurring series. Month-based steps anchor on the original day each time
 * (31 Jan → 28 Feb → 31 Mar), so short months never make the schedule drift.
 */
export function nextRecurrence(anchor: IsoDate, frequency: Frequency, step: number): IsoDate {
  const [y, m, d] = anchor.split("-").map(Number)
  if (frequency === "weekly") return new Date(Date.UTC(y, m - 1, d + 7 * step)).toISOString().slice(0, 10)
  const months = frequency === "monthly" ? step : frequency === "quarterly" ? 3 * step : 12 * step
  const target = new Date(Date.UTC(y, m - 1 + months, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(d, lastDay))
  return target.toISOString().slice(0, 10)
}

/** The first step of a series dated on or after `date` — where a resumed series picks up instead of back-billing. */
export function firstStepOnOrAfter(anchor: IsoDate, frequency: Frequency, from: number, date: IsoDate): number {
  let step = from
  while (nextRecurrence(anchor, frequency, step) < date) step++
  return step
}

/** Dunning level due for an overdue invoice, given the days-after-due schedule and the level already sent. */
export function dueReminderLevel(dueDate: IsoDate, today: IsoDate, scheduleDays: number[], sentLevel: number): number | null {
  const daysOverdue = Math.round((Date.parse(today) - Date.parse(dueDate)) / 86_400_000)
  const reached = scheduleDays.filter((d) => daysOverdue >= d).length
  return reached > sentLevel ? reached : null
}
