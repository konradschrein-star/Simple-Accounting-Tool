import pLimit from "p-limit"
import { z } from "zod"
import type { Reconciliation, RowIssue } from "@/db/schema"
import type { NormalizedRow } from "@/ingest/csv/types"
import { imagePart, LlmError, type LlmContent, type LlmPort } from "@/ingest/llm/client"
import { extractionPenalty, flagBalanceBreaks, flagUnsupportedAmounts, reconcile } from "@/ingest/verify"
import { roundHalfAwayFromZero } from "@/lib/money"
import { normalizeCurrency, parsePrintedAmount, statementDecimal } from "./printed-amount"

export const pageSchema = z.object({
  currency: z.string().nullable().describe("ISO currency code printed on the statement, e.g. EUR"),
  opening_balance: z.number().nullable().describe("Opening/previous balance printed on THIS page, signed, else null"),
  closing_balance: z.number().nullable().describe("Closing/new balance printed on THIS page, signed, else null"),
  transactions: z.array(
    z.object({
      date: z.string().describe("Booking date as ISO YYYY-MM-DD"),
      description: z.string().describe("Purpose / reference text"),
      counterparty: z.string().nullable().describe("Payer or payee name if printed"),
      amount_text: z.string().describe("The amount exactly as printed on the page, including sign/suffix"),
      amount: z.number().describe("Absolute amount as a decimal number"),
      type: z.enum(["credit", "debit"]),
      balance: z.number().nullable().describe("Running balance after this line if printed, signed"),
    })
  ),
})
type PageResult = z.infer<typeof pageSchema>

const SYSTEM = `You extract bank statement transactions into JSON.
Rules:
- Only output lines that are actual account movements (no headers, totals, carried-forward lines or interest summaries).
- Copy values exactly as printed. Never invent, merge or infer transactions.
- Dates: convert to ISO YYYY-MM-DD; if the year is missing use the statement period's year.
- type is "debit" for money leaving the account, "credit" for money arriving.
- amount is the absolute value; amount_text is the literal printed string.
- If a field is not printed, use null.`

export type PdfModels = { text: string; vision: string; escalation: string }

export type PdfExtraction = {
  rows: NormalizedRow[]
  reconciliation: Reconciliation
  parser: "pdf_text" | "pdf_vision"
  model: string
  attempts: number
  currency: string | null
}

const toMinor = (n: number | null) => (n === null ? null : roundHalfAwayFromZero(n * 100))

/** A page counts as digital when its text layer carries real content; scans have (almost) none. */
const MIN_TEXT_CHARS_PER_PAGE = 200
const MIN_DIGITAL_PAGE_SHARE = 0.7

export function isDigitalStatement(pageTexts: string[]): boolean {
  if (!pageTexts.length) return false
  const digital = pageTexts.filter((t) => t.replace(/\s+/g, "").length >= MIN_TEXT_CHARS_PER_PAGE).length
  return digital / pageTexts.length >= MIN_DIGITAL_PAGE_SHARE
}

/**
 * The printed amount is the ground truth: magnitude and sign come from the literal text when it parses,
 * and any disagreement with the model's own reading is flagged for review.
 */
function assemble(pages: PageResult[], pageTexts: string[] | null): Omit<PdfExtraction, "parser" | "model" | "attempts"> {
  const decimal = statementDecimal(pages.flatMap((p) => p.transactions.map((t) => t.amount_text)))
  let rows: (NormalizedRow & { amountText: string })[] = []
  pages.forEach((page, p) => {
    const pageRows = page.transactions.map((t) => {
      const issues: RowIssue[] = []
      const date = /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? t.date : null
      if (!date) issues.push("unparseable_date")
      const modelMagnitude = Math.abs(toMinor(t.amount) ?? 0)
      const modelSign = t.type === "debit" ? -1 : 1
      const printed = parsePrintedAmount(t.amount_text, decimal)
      if ((printed.magnitudeMinor !== null && printed.magnitudeMinor !== modelMagnitude) || (printed.sign !== null && printed.sign !== modelSign))
        issues.push("low_confidence")
      return {
        rowIndex: 0,
        date,
        description: t.description.trim(),
        counterparty: t.counterparty?.trim() ?? "",
        amountMinor: (printed.sign ?? modelSign) * (printed.magnitudeMinor ?? modelMagnitude),
        balanceMinor: toMinor(t.balance),
        amountText: t.amount_text,
        raw: [String(p + 1), t.date, t.description, t.amount_text, t.type, String(t.balance ?? "")],
        issues,
      }
    })
    rows.push(...(pageTexts ? flagUnsupportedAmounts(pageRows, pageTexts[p] ?? "") : pageRows))
  })
  rows = flagBalanceBreaks(rows).map((r, i) => ({ ...r, rowIndex: i + 1 }))
  const opening = toMinor(pages.find((p) => p.opening_balance !== null)?.opening_balance ?? null)
  const closing = toMinor([...pages].reverse().find((p) => p.closing_balance !== null)?.closing_balance ?? null)
  return {
    rows,
    reconciliation: reconcile(rows, opening, closing),
    currency: pages.map((p) => normalizeCurrency(p.currency)).find(Boolean) ?? null,
  }
}

async function extractPages(llm: LlmPort, model: string, inputs: LlmContent[], concurrency: number) {
  const limit = pLimit(concurrency)
  let usedModel = model
  const pages = await Promise.all(
    inputs.map((user, index) =>
      limit(async () => {
        const { data, model: m } = await llm({
          model,
          name: "bank_statement_page",
          schema: pageSchema,
          system: SYSTEM,
          user: Array.isArray(user)
            ? [{ type: "text", text: `Page ${index + 1} of ${inputs.length}.` }, ...user]
            : `Page ${index + 1} of ${inputs.length}:\n\n${user}`,
        })
        usedModel = m
        return data
      })
    )
  )
  return { pages, model: usedModel }
}

/**
 * Text layer → cheap text model when the PDF is digital; page images → vision model for scans.
 * If the result does not reconcile against the statement's own balances, escalate once to a larger
 * vision model and keep whichever extraction verifies better.
 */
export async function extractStatement(input: {
  llm: LlmPort
  models: PdfModels
  pageTexts: string[]
  renderImages: () => Promise<Buffer[]>
  concurrency?: number
}): Promise<PdfExtraction> {
  const concurrency = input.concurrency ?? 3
  const digital = isDigitalStatement(input.pageTexts)
  let attempts = 1
  let primary: PdfExtraction
  if (digital) {
    const { pages, model } = await extractPages(input.llm, input.models.text, input.pageTexts, concurrency)
    primary = { ...assemble(pages, input.pageTexts), parser: "pdf_text", model, attempts }
  } else {
    const images = await input.renderImages()
    const { pages, model } = await extractPages(
      input.llm,
      input.models.vision,
      images.map((png) => [imagePart(png)]),
      concurrency
    )
    primary = { ...assemble(pages, null), parser: "pdf_vision", model, attempts }
  }
  if (primary.rows.length === 0 && !digital) throw new LlmError("LLM_INVALID_OUTPUT", "No transactions found")
  if (primary.reconciliation.ok !== false) return primary

  attempts++
  try {
    const images = await input.renderImages()
    const { pages, model } = await extractPages(
      input.llm,
      input.models.escalation,
      images.map((png) => [imagePart(png)]),
      concurrency
    )
    const escalated: PdfExtraction = { ...assemble(pages, null), parser: "pdf_vision", model, attempts }
    const best = extractionPenalty(escalated.rows, escalated.reconciliation) < extractionPenalty(primary.rows, primary.reconciliation) ? escalated : primary
    return { ...best, attempts }
  } catch {
    return { ...primary, attempts }
  }
}
