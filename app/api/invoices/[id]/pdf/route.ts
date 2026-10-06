import type { NextRequest } from "next/server"
import { db } from "@/db/client"
import { invoicePdf } from "@/pdf/invoice-file"
import { requireReadyOrg } from "@/server/context"
import { documentContext } from "@/server/repos/invoices"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireReadyOrg()
  const found = documentContext(db, ctx.orgId, (await params).id)
  if (!found) return new Response("Not found", { status: 404 })
  const pdf = await invoicePdf(db, ctx.orgId, found)
  const filename = `${found.invoice.number ?? "draft"}.pdf`.replace(/[^\w.-]/g, "_")
  const disposition = request.nextUrl.searchParams.has("download") ? "attachment" : "inline"
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `${disposition}; filename="${filename}"`, "Cache-Control": "private, no-store" },
  })
}
