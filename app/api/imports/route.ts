import { revalidatePath } from "next/cache"
import { limits } from "@/lib/rate-limit"
import { ImportRejected, startImport } from "@/ingest/service"
import { audit, requireReadyOrg } from "@/server/context"

export async function POST(request: Request) {
  const ctx = await requireReadyOrg()
  if (!limits.upload(ctx.user.id)) return Response.json({ code: "RATE_LIMITED" }, { status: 429 })
  const file = (await request.formData()).get("file")
  if (!(file instanceof File)) return Response.json({ code: "UNSUPPORTED_TYPE" }, { status: 400 })
  try {
    const batch = startImport({
      orgId: ctx.orgId,
      jurisdiction: ctx.jurisdiction.code,
      currency: ctx.settings.currency,
      today: ctx.today,
      filename: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    })
    audit(ctx, "import.uploaded", "import", batch.id, { source: batch.source, filename: batch.filename })
    revalidatePath("/imports")
    return Response.json({ id: batch.id, status: batch.status }, { status: batch.source === "pdf" ? 202 : 201 })
  } catch (error) {
    if (error instanceof ImportRejected) return Response.json({ code: error.code }, { status: error.status })
    throw error
  }
}
