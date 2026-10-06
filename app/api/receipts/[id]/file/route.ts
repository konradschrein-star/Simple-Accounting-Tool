import fs from "node:fs"
import { db } from "@/db/client"
import { dataPath } from "@/lib/data-path"
import { requireReadyOrg } from "@/server/context"
import { getReceipt } from "@/server/repos/receipts"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireReadyOrg()
  const receipt = getReceipt(db, ctx.orgId, (await params).id)
  if (!receipt) return new Response("Not found", { status: 404 })
  const file = dataPath(receipt.filePath)
  if (!fs.existsSync(file)) return new Response("Not found", { status: 404 })
  const download = new URL(request.url).searchParams.has("download")
  return new Response(new Uint8Array(fs.readFileSync(file)), {
    headers: {
      "Content-Type": receipt.mimeType,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${receipt.filename.replace(/[^\w.-]/g, "_")}"`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
