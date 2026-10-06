import fs from "node:fs"
import path from "node:path"
import { eq } from "drizzle-orm"
import type { NextRequest } from "next/server"
import { db } from "@/db/client"
import { invoices } from "@/db/schema"
import { env } from "@/lib/env"
import { renderInvoicePdf } from "@/pdf/render"
import { requireReadyOrg } from "@/server/context"
import { previewContext } from "@/server/repos/invoices"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireReadyOrg()
  const { id } = await params
  const found = previewContext(db, ctx.orgId, ctx.jurisdiction, id)
  if (!found) return new Response("Not found", { status: 404 })
  const { invoice, snapshot } = found

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

  let pdf: Buffer
  if (invoice.status === "finalized" || invoice.status === "paid") {
    // Finalized invoices are immutable: render once from the snapshot, then serve the stored file.
    const relative = path.join("pdfs", ctx.orgId, `${invoice.id}.pdf`)
    const file = path.join(path.resolve(env().DATA_DIR), relative)
    if (invoice.pdfPath && fs.existsSync(file)) pdf = fs.readFileSync(file)
    else {
      pdf = await render()
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, pdf)
      db.update(invoices).set({ pdfPath: relative }).where(eq(invoices.id, invoice.id)).run()
    }
  } else {
    pdf = await render()
  }

  const filename = `${invoice.number ?? "draft"}.pdf`.replace(/[^\w.-]/g, "_")
  const disposition = request.nextUrl.searchParams.has("download") ? "attachment" : "inline"
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  })
}
