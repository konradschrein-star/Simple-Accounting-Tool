import type { InvoiceSnapshot } from "@/db/schema"
import type { Jurisdiction, TaxProfile } from "@/jurisdictions"
import type { IsoDate } from "@/lib/dates"
import { computeTotals, lineNetMinor } from "@/lib/money"

export type InvoiceStatus = "draft" | "finalized" | "paid" | "void"
export type DisplayStatus = "draft" | "open" | "overdue" | "paid" | "void"

/** Overdue is derived, never stored, so it can never go stale. */
export function displayStatus(invoice: { status: InvoiceStatus; dueDate: IsoDate }, today: IsoDate): DisplayStatus {
  if (invoice.status === "finalized") return invoice.dueDate < today ? "overdue" : "open"
  return invoice.status
}

export function formatInvoiceNumber(prefix: string, year: number, seq: number): string {
  return `${prefix}${year}-${String(seq).padStart(4, "0")}`
}

export type SellerInfo = {
  name: string
  legalName: string
  addressLine1: string
  addressLine2: string
  postcode: string
  city: string
  country: string
  email: string
  phone: string
  website: string
  taxNumber: string
  vatId: string
  bankIban: string
  bankBic: string
  ukSortCode: string
  ukAccountNumber: string
  usRoutingNumber: string
}

export type ClientInfo = {
  name: string
  email: string
  addressLine1: string
  addressLine2: string
  postcode: string
  city: string
  country: string
  vatId: string
}

export type DraftLine = { description: string; quantityMilli: number; unitPriceMinor: number; taxRateBp: number }

/** Human-readable reasons why an invoice cannot be finalized yet (empty = OK). */
export function finalizeBlockers(input: {
  jurisdiction: Jurisdiction
  profile: TaxProfile
  seller: SellerInfo
  client: ClientInfo | null
  serviceDate: IsoDate | null
  lines: DraftLine[]
}): string[] {
  const { jurisdiction, profile, seller, client, serviceDate, lines } = input
  const problems: string[] = []
  if (!client) problems.push("Choose a client.")
  if (!lines.some((l) => l.description.trim() && l.quantityMilli !== 0)) problems.push("Add at least one line item.")
  if (lines.some((l) => !l.description.trim() && l.unitPriceMinor !== 0)) problems.push("Every priced line needs a description.")
  for (const requirement of jurisdiction.requiredInvoiceFields(profile)) {
    if (requirement === "sellerAddress" && !(seller.addressLine1 && seller.city))
      problems.push("Add your business address in Settings.")
    if (requirement === "clientAddress" && client && !(client.addressLine1 && client.city))
      problems.push(`Add an address for ${client.name}.`)
    if (requirement === "sellerTaxId" && !(seller.taxNumber || seller.vatId))
      problems.push(`Add your ${jurisdiction.taxIdLabel} in Settings.`)
    if (requirement === "serviceDate" && !serviceDate)
      problems.push(jurisdiction.code === "de" ? "Set the Leistungsdatum (service date)." : "Set the date of supply.")
  }
  if (profile.smallBusinessExempt && lines.some((l) => l.taxRateBp > 0)) problems.push("§19 UStG invoices cannot charge USt.")
  return problems
}

/** Frozen copy of everything printed on a finalized invoice. */
export function buildSnapshot(input: {
  jurisdiction: Jurisdiction
  profile: TaxProfile
  seller: SellerInfo
  client: ClientInfo
  lines: DraftLine[]
  logoPath: string | null
  currency: InvoiceSnapshot["currency"]
  locale: string
}): InvoiceSnapshot {
  const lines = input.lines.filter((l) => l.description.trim() || l.unitPriceMinor !== 0)
  return {
    seller: { ...input.seller },
    client: { ...input.client },
    jurisdiction: input.jurisdiction.code,
    language: input.jurisdiction.invoiceLanguage,
    currency: input.currency,
    locale: input.locale,
    taxLabel: input.jurisdiction.taxLabel,
    exemptionNote: input.jurisdiction.exemptionNote(input.profile),
    logoPath: input.logoPath,
    items: lines.map((l) => ({ ...l, netMinor: lineNetMinor(l.quantityMilli, l.unitPriceMinor) })),
    taxGroups: computeTotals(lines).taxGroups,
  }
}
