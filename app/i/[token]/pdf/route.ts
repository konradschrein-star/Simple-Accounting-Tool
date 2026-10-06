import type { NextRequest } from "next/server"
import { db } from "@/db/client"
import { invoicePdf } from "@/pdf/invoice-file"
import { clientIp } from "@/lib/client-ip"
import { limits } from "@/lib/rate-limit"
import { findByPublicToken } from "@/server/repos/invoices"

/** The PDF behind a public link — same file the owner downloads, no login. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const found = findByPublicToken(db, (await params).token)
  if (!found) return new Response("Not found", { status: 404 })
  if (!limits.publicLink(await clientIp())) return new Response("Too many requests", { status: 429 })
  const { invoice } = found
  const pdf = await invoicePdf(db, invoice.orgId, { invoice, snapshot: invoice.snapshot })
  const filename = `${invoice.number}.pdf`.replace(/[^\w.-]/g, "_")
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
