import fs from "node:fs"
import path from "node:path"
import { nanoid } from "nanoid"
import { revalidatePath } from "next/cache"
import { enqueueReceipt } from "@/bookkeeping/receipt-jobs"
import { db } from "@/db/client"
import { dataPath } from "@/lib/data-path"
import { limits } from "@/lib/rate-limit"
import { audit, requireReadyOrg } from "@/server/context"
import { createReceipt, ReceiptError } from "@/server/repos/receipts"

const MAX_BYTES = 10 * 1024 * 1024

/** Trust the bytes, not the browser's content type. HEIC is not accepted — phones export JPEG on share. */
function sniff(bytes: Uint8Array): { ext: string; mimeType: string } | null {
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return { ext: "pdf", mimeType: "application/pdf" }
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { ext: "png", mimeType: "image/png" }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { ext: "jpg", mimeType: "image/jpeg" }
  return null
}

export async function POST(request: Request) {
  const ctx = await requireReadyOrg()
  if (!limits.receipts(ctx.orgId)) return Response.json({ error: "That's a lot of receipts at once — please wait a few minutes." }, { status: 429 })
  const form = await request.formData()
  const file = form.get("file")
  const transactionId = typeof form.get("transactionId") === "string" ? String(form.get("transactionId")) : null
  if (!(file instanceof File)) return Response.json({ error: "No file uploaded" }, { status: 400 })
  if (file.size > MAX_BYTES) return Response.json({ error: "Receipts must be under 10 MB" }, { status: 413 })
  const bytes = new Uint8Array(await file.arrayBuffer())
  const kind = sniff(bytes)
  if (!kind) return Response.json({ error: "Upload a PDF, JPG or PNG" }, { status: 415 })

  const id = nanoid()
  const filePath = path.join("uploads", ctx.orgId, "receipts", `${id}.${kind.ext}`)
  fs.mkdirSync(path.dirname(dataPath(filePath)), { recursive: true })
  fs.writeFileSync(dataPath(filePath), bytes)
  try {
    createReceipt(db, ctx.orgId, { id, filePath, filename: file.name.slice(0, 200), mimeType: kind.mimeType, sizeBytes: file.size, transactionId })
  } catch (error) {
    fs.rmSync(dataPath(filePath), { force: true })
    if (error instanceof ReceiptError) return Response.json({ error: error.message }, { status: 404 })
    throw error
  }
  enqueueReceipt(ctx.orgId, id)
  audit(ctx, "receipt.uploaded", "receipt", id, { filename: file.name })
  revalidatePath("/receipts")
  if (transactionId) revalidatePath("/transactions")
  return Response.json({ id }, { status: 202 })
}
