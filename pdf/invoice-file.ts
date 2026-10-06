import "server-only"
import fs from "node:fs"
import path from "node:path"
import type { Db } from "@/db/client"
import { dataPath } from "@/lib/data-path"
import { setInvoicePdfPath, type DocumentContext } from "@/server/repos/invoices"
import { renderInvoicePdf } from "./render"

/**
 * The PDF for a document. Drafts render live (watermarked); issued documents are immutable,
 * so they render once from the frozen snapshot and every later request serves the stored file.
 */
export async function invoicePdf(db: Db, orgId: string, { invoice, snapshot }: Pick<DocumentContext, "invoice" | "snapshot">): Promise<Buffer> {
  const watermark = invoice.status === "draft" ? "draft" : invoice.status === "cancelled" ? "cancelled" : null
  const render = () =>
    renderInvoicePdf({
      snapshot,
      number: invoice.number,
      issueDate: invoice.issueDate,
      serviceDate: invoice.serviceDate,
      dueDate: invoice.dueDate,
      notes: invoice.notes,
      paymentTerms: invoice.paymentTerms,
      stripePaymentLink: invoice.stripePaymentLink,
      watermark,
    })
  // Drafts change constantly and cancelled ones carry a stamp; everything else is frozen.
  if (watermark) return render()

  const relative = path.join("pdfs", orgId, `${invoice.id}.pdf`)
  const file = dataPath(relative)
  if (invoice.pdfPath && fs.existsSync(file)) return fs.readFileSync(file)
  const pdf = await render()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, pdf)
  setInvoicePdfPath(db, orgId, invoice.id, relative)
  return pdf
}
