import "server-only"
import fs from "node:fs"
import pLimit from "p-limit"
import { db } from "@/db/client"
import { defaultLlm, imagePart, type LlmContent } from "@/ingest/llm/client"
import { pdfPageImages, pdfPageTexts } from "@/ingest/pdf/poppler"
import { dataPath } from "@/lib/data-path"
import { env } from "@/lib/env"
import { getReceipt, recordExtraction } from "@/server/repos/receipts"
import { normalizeReceipt, RECEIPT_PROMPT, receiptExtractionSchema } from "./receipts"

const jobs = pLimit(3)

/** A digital PDF's text layer is cheaper and more exact than pixels; scans and photos go to the vision model. */
async function receiptContent(file: string, mimeType: string): Promise<{ content: LlmContent; vision: boolean }> {
  if (mimeType === "application/pdf") {
    const text = (await pdfPageTexts(file)).slice(0, 2).join("\n\n")
    if (text.replace(/\s+/g, "").length >= 80) return { content: `Receipt text:\n\n${text}`, vision: false }
    const [page] = await pdfPageImages(file, 1)
    return { content: [{ type: "text", text: "Read this receipt." }, imagePart(page)], vision: true }
  }
  return { content: [{ type: "text", text: "Read this receipt." }, imagePart(fs.readFileSync(file), mimeType === "image/png" ? "image/png" : "image/jpeg")], vision: true }
}

async function processReceipt(orgId: string, id: string) {
  const receipt = getReceipt(db, orgId, id)
  if (!receipt) return
  const llm = defaultLlm()
  if (!llm) return recordExtraction(db, orgId, id, null)
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
    recordExtraction(db, orgId, id, normalizeReceipt(data))
  } catch (error) {
    console.warn(`[receipt ${id}]`, error instanceof Error ? error.message : error)
    recordExtraction(db, orgId, id, null)
  }
}

export function enqueueReceipt(orgId: string, id: string) {
  jobs(() => processReceipt(orgId, id)).catch((error) => console.error(`[receipt ${id}] crashed`, error))
}
