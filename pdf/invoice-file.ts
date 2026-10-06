import "server-only"
import fs from "node:fs"
import path from "node:path"
import type { Db } from "@/db/client"
import { dataPath } from "@/lib/data-path"
import { setInvoicePdfPath, type previewContext } from "@/server/repos/invoices"
import { renderInvoicePdf } from "./render"

type Preview = NonNullable<ReturnType<typeof previewContext>>

/**
 * The PDF for an invoice. Drafts render live (watermarked); finalized and paid invoices are immutable,
 * so they render once from the frozen snapshot and every later request serves the stored file.
 */
export async function invoicePdf(db: Db, orgId: string, { invoice, snapshot }: Preview): Promise<Buffer> {
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
      watermark: invoice.status === "draft" ? "draft" : invoice.status === "void" ? "void" : null,
    })
  if (invoice.status !== "finalized" && invoice.status !== "paid") return render()

  const relative = path.join("pdfs", orgId, `${invoice.id}.pdf`)
  const file = dataPath(relative)
  if (invoice.pdfPath && fs.existsSync(file)) return fs.readFileSync(file)
  const pdf = await render()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, pdf)
  setInvoicePdfPath(db, orgId, invoice.id, relative)
  return pdf
}
