import { db } from "@/db/client"
import { requireReadyOrg } from "@/server/context"
import { getBatch } from "@/server/repos/imports"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireReadyOrg()
  const batch = getBatch(db, ctx.orgId, (await params).id)
  if (!batch) return Response.json({ error: "Not found" }, { status: 404 })
  return Response.json({ status: batch.status, errorCode: batch.errorCode, rowCount: batch.rowCount })
}
