import type { NextRequest } from "next/server"
import { db } from "@/db/client"
import { eInvoiceFile, type EInvoiceFormat } from "@/einvoice/service"
import { DomainError } from "@/lib/action-result"
import { requireReadyOrg } from "@/server/context"
import { previewContext } from "@/server/repos/invoices"

const FORMATS: EInvoiceFormat[] = ["zugferd", "xrechnung"]

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireReadyOrg()
  const format = request.nextUrl.searchParams.get("format") as EInvoiceFormat
  if (!FORMATS.includes(format)) return new Response("Unknown format", { status: 400 })
  const found = previewContext(db, ctx.orgId, ctx.jurisdiction, (await params).id)
  if (!found) return new Response("Not found", { status: 404 })
  try {
    const file = await eInvoiceFile(db, ctx.orgId, found, ctx.jurisdiction, format)
    return new Response(new Uint8Array(file.body), {
      headers: { "Content-Type": file.contentType, "Content-Disposition": `attachment; filename="${file.filename}"`, "Cache-Control": "private, no-store" },
    })
  } catch (error) {
    if (error instanceof DomainError) return new Response(error.message, { status: 422, headers: { "Content-Type": "text/plain; charset=utf-8" } })
    throw error
  }
}
