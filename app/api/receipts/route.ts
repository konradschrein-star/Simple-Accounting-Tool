import { nanoid } from "nanoid"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { enqueueReceipt } from "@/bookkeeping/receipt-jobs"
import { RECEIPT_UPLOAD, sniffReceipt } from "@/bookkeeping/receipts"
import { db } from "@/db/client"
import { removeUpload, storeUpload } from "@/lib/storage"
import { limits } from "@/lib/rate-limit"
import { audit, requireReadyOrg } from "@/server/context"
import { createReceipt, ReceiptError } from "@/server/repos/receipts"

const formSchema = z.object({
  file: z.instanceof(File, { message: "No file uploaded" }).refine((f) => f.size <= RECEIPT_UPLOAD.maxBytes, "Receipts must be under 10 MB"),
  transactionId: z.string().min(1).max(64).nullable().default(null),
})

export async function POST(request: Request) {
  const ctx = await requireReadyOrg()
  if (!limits.receipts(ctx.orgId)) return Response.json({ error: "That's a lot of receipts at once — please wait a few minutes." }, { status: 429 })
  const form = await request.formData()
  const parsed = formSchema.safeParse({ file: form.get("file"), transactionId: form.get("transactionId") })
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid upload" }, { status: 400 })
  const { file, transactionId } = parsed.data
  const bytes = new Uint8Array(await file.arrayBuffer())
  const kind = sniffReceipt(bytes)
  if (!kind) return Response.json({ error: "Upload a PDF, JPG or PNG" }, { status: 415 })

  const id = nanoid()
  const filePath = storeUpload(ctx.orgId, "receipts", id, kind.ext, bytes)
  try {
    createReceipt(db, ctx.orgId, { id, filePath, filename: file.name.slice(0, 200), mimeType: kind.mimeType, sizeBytes: file.size, transactionId })
  } catch (error) {
    removeUpload(filePath)
    if (error instanceof ReceiptError) return Response.json({ error: error.message }, { status: error.status })
    throw error
  }
  enqueueReceipt(ctx.orgId, id)
  audit(ctx, "receipt.uploaded", "receipt", id, { filename: file.name, transactionId })
  revalidatePath("/receipts")
  if (transactionId) revalidatePath("/transactions")
  return Response.json({ id }, { status: 202 })
}
