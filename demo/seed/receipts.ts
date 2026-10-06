import { createHash } from "node:crypto"
import { defaultInputTaxBp } from "@/jurisdictions"
import { formatMoney, roundHalfAwayFromZero } from "@/lib/money"
import { uploadPath } from "@/lib/storage"
import { createReceipt, recordExtraction } from "@/server/repos/receipts"
import { byRole, type SeedContext } from "./context"
import type { BookedRow } from "./ledger"
import { receiptPdf } from "../receipt-pdf"

/** A file the seed promises to write once its database transaction has committed. */
export type PendingFile = { path: string; bytes: Uint8Array }

/**
 * Receipts go through the same repo calls as real uploads: the vendors marked `receipt` get theirs attached to their
 * latest payment (VAT rate applied from the document), and one recent purchase waits in the inbox with a proposed match.
 */
export function seedReceipts(ctx: SeedContext, booked: BookedRow[]): PendingFile[] {
  const latest = (counterparty: string) => booked.findLast((b) => b.row.counterparty === counterparty)
  const attached = ctx.persona.vendors.filter((v) => v.receipt).map((v) => latest(v.counterparty))
  const inbox = latest(byRole(ctx.persona.recentOneOffs, "inboxReceipt", "one-off").counterparty)
  return [...attached.map((b) => b && receipt(ctx, b, true)), inbox && receipt(ctx, inbox, false)].filter((f): f is PendingFile => !!f)
}

function receipt(ctx: SeedContext, booked: BookedRow, attach: boolean): PendingFile {
  const { db, orgId, settings, jurisdiction, persona } = ctx
  const { row } = booked
  const total = -row.amountMinor
  const rateBp = settings.taxRegistered && booked.accountCode ? defaultInputTaxBp(jurisdiction, booked.accountCode) : 0
  const vat = roundHalfAwayFromZero((total * rateBp) / (10_000 + rateBp))
  const money = (minor: number) => formatMoney(minor, settings.currency, settings.locale)
  const id = `demo${createHash("sha256").update(`${orgId}|receipt|${booked.id}`).digest("hex").slice(0, 17)}`
  const bytes = receiptPdf([
    { text: row.counterparty, size: 16, bold: true },
    { text: `Invoice R-${row.date.replace(/-/g, "")}`, gapBefore: 8 },
    { text: `Date: ${row.date}` },
    { text: `Bill to: ${persona.business.legalName}` },
    { text: row.description, gapBefore: 16 },
    { text: `Net: ${money(total - vat)}`, gapBefore: 16 },
    { text: `${jurisdiction.taxLabel} ${rateBp / 100} %: ${money(vat)}` },
    { text: `Total: ${money(total)}`, size: 12, bold: true },
    { text: "Paid - thank you.", gapBefore: 16 },
  ])
  const path = uploadPath(orgId, "receipts", id, "pdf")
  createReceipt(db, orgId, {
    id,
    filePath: path,
    filename: `${row.counterparty.replace(/[^\w]+/g, "-").toLowerCase()}-${row.date}.pdf`,
    mimeType: "application/pdf",
    sizeBytes: bytes.byteLength,
    transactionId: attach ? booked.id : null,
  })
  recordExtraction(db, orgId, id, { vendor: row.counterparty, date: row.date, totalMinor: total, vatMinor: vat, currency: settings.currency }, jurisdiction)
  return { path, bytes }
}
