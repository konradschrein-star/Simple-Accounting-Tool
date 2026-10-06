import type { NextRequest } from "next/server"
import { db } from "@/db/client"
import { getJurisdiction } from "@/jurisdictions"
import { invoicePdf } from "@/pdf/invoice-file"
import { findByPublicToken, previewContext } from "@/server/repos/invoices"
import { getSettings } from "@/server/repos/workspace"

/** The PDF behind a public link — same file the owner downloads, no login. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const found = findByPublicToken(db, (await params).token)
  if (!found) return new Response("Not found", { status: 404 })
  const { orgId, id } = found.invoice
  const code = getSettings(db, orgId).jurisdiction
  const ctx = code ? previewContext(db, orgId, getJurisdiction(code), id) : null
  if (!ctx) return new Response("Not found", { status: 404 })
  const pdf = await invoicePdf(db, orgId, ctx)
  const filename = `${ctx.invoice.number}.pdf`.replace(/[^\w.-]/g, "_")
  const disposition = request.nextUrl.searchParams.has("inline") ? "inline" : "attachment"
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  })
}
