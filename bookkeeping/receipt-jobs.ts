import "server-only"
import fs from "node:fs"
import pLimit from "p-limit"
import { db } from "@/db/client"
import { defaultLlm, imagePart, type LlmContent } from "@/ingest/llm/client"
import { pdfPageImages, pdfPageTexts } from "@/ingest/pdf/poppler"
import { getJurisdiction } from "@/jurisdictions"
import { dataPath } from "@/lib/data-path"
import { fromIso, monthKey, todayIn } from "@/lib/dates"
import { env } from "@/lib/env"
import { getReceipt, receiptsUploadedSince, recordExtraction, type Receipt } from "@/server/repos/receipts"
import { getSettings } from "@/server/repos/workspace"
import { normalizeReceipt, RECEIPT_PROMPT, receiptExtractionSchema, type ReceiptData, type ReceiptMimeType } from "./receipts"

const jobs = pLimit(3)

/** A digital PDF's text layer is cheaper and more exact than pixels; scans and photos go to the vision model. */
async function receiptContent(file: string, mimeType: ReceiptMimeType): Promise<{ content: LlmContent; vision: boolean }> {
  if (mimeType === "application/pdf") {
    const text = (await pdfPageTexts(file)).slice(0, 2).join("\n\n")
    if (text.replace(/\s+/g, "").length >= 80) return { content: `Receipt text:\n\n${text}`, vision: false }
    const [page] = await pdfPageImages(file, 1)
    return { content: [{ type: "text", text: "Read this receipt." }, imagePart(page)], vision: true }
  }
  return { content: [{ type: "text", text: "Read this receipt." }, imagePart(fs.readFileSync(file), mimeType)], vision: true }
}

/** The AI read, or null when AI is off, over quota or the document is unreadable. Never touches the database. */
async function readReceipt(receipt: Receipt, quotaLeft: boolean): Promise<ReceiptData | null> {
  const llm = defaultLlm()
  if (!llm || !quotaLeft) return null
  try {
    const { content, vision } = await receiptContent(dataPath(receipt.filePath), receipt.mimeType)
    const { data } = await llm({
      model: vision ? env().LLM_VISION_MODEL : env().LLM_TEXT_MODEL,
      name: "receipt",
      schema: receiptExtractionSchema,
      system: RECEIPT_PROMPT,
      user: content,
      maxTokens: 800,
    })
    return normalizeReceipt(data)
  } catch (error) {
    console.warn(`[receipt ${receipt.id}]`, error instanceof Error ? error.message : error)
    return null
  }
}

async function processReceipt(orgId: string, id: string) {
  const receipt = getReceipt(db, orgId, id)
  const settings = getSettings(db, orgId)
  if (!receipt || !settings.jurisdiction) return
  const monthStart = fromIso(`${monthKey(todayIn(settings.timezone))}-01`)
  const quota = settings.isDemo ? Math.ceil(env().RECEIPT_READS_PER_MONTH / 10) : env().RECEIPT_READS_PER_MONTH
  const data = await readReceipt(receipt, receiptsUploadedSince(db, orgId, monthStart) <= quota)
  recordExtraction(db, orgId, id, data, getJurisdiction(settings.jurisdiction))
}

export function enqueueReceipt(orgId: string, id: string) {
  jobs(() => processReceipt(orgId, id)).catch((error) => console.error(`[receipt ${id}] crashed`, error))
}
