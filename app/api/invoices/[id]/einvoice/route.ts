import type { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/db/client"
import { E_INVOICE_FORMATS, eInvoiceFile } from "@/einvoice/service"
import { DomainError } from "@/lib/action-result"
import { requireReadyOrg } from "@/server/context"
import { documentContext } from "@/server/repos/invoices"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireReadyOrg()
  const format = z.enum(E_INVOICE_FORMATS).safeParse(request.nextUrl.searchParams.get("format"))
  if (!format.success) return new Response("Unknown format", { status: 400 })
  const found = documentContext(db, ctx.orgId, (await params).id)
  if (!found) return new Response("Not found", { status: 404 })
  try {
    const file = await eInvoiceFile(db, ctx.orgId, found, format.data)
    return new Response(new Uint8Array(file.body), {
      headers: { "Content-Type": file.contentType, "Content-Disposition": `attachment; filename="${file.filename}"`, "Cache-Control": "private, no-store" },
    })
  } catch (error) {
    if (error instanceof DomainError) return new Response(error.message, { status: 422, headers: { "Content-Type": "text/plain; charset=utf-8" } })
    throw error
  }
}
