import { z } from "zod"
import type { LlmPort } from "@/ingest/llm/client"
import type { AccountRef, Uncategorized } from "./categorize"

const resultSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      account_code: z.string().nullable().describe("Code from the chart of accounts, or null if unsure"),
      confidence: z.number().min(0).max(1),
    }),
  ),
})

export type AiSuggestion = { accountId: string | null; confidence: number }

const SYSTEM = `You are a meticulous bookkeeper. Assign each bank transaction to exactly one account from the provided chart of accounts.
- Negative amounts are money out (expenses, tax payments, owner drawings, transfers). Positive amounts are money in (income, owner contributions, transfers, refunds).
- Use the examples of the client's past decisions as strong guidance.
- confidence: your calibrated probability (0-1) that a professional accountant would choose the same account. Use < 0.6 when the description is vague.
- Use account_code null if no account fits.`

/**
 * One LLM call per batch of ≤50 transactions. Returns a suggestion per transaction; unknown codes become null
 * so they land in the human review queue instead of on a wrong account.
 */
export async function suggestAccounts(input: {
  llm: LlmPort
  model: string
  accounts: AccountRef[]
  examples: { description: string; counterparty: string; amountMinor: number; accountCode: string }[]
  txns: Uncategorized[]
  currency: string
}): Promise<Map<string, AiSuggestion>> {
  const byCode = new Map(input.accounts.map((a) => [a.code, a]))
  const out = new Map<string, AiSuggestion>()
  for (let i = 0; i < input.txns.length; i += 50) {
    const batch = input.txns.slice(i, i + 50)
    const { data } = await input.llm({
      model: input.model,
      name: "transaction_categories",
      schema: resultSchema,
      system: SYSTEM,
      user: JSON.stringify({
        currency: input.currency,
        chart_of_accounts: input.accounts.map((a) => ({ code: a.code, name: a.name, kind: a.kind, tax_line: a.taxLine })),
        past_decisions: input.examples.slice(0, 20).map((e) => ({ text: `${e.counterparty} ${e.description}`.trim(), amount: e.amountMinor / 100, code: e.accountCode })),
        transactions: batch.map((t) => ({ id: t.id, text: `${t.counterparty} ${t.description}`.trim(), amount: t.amountMinor / 100 })),
      }),
    })
    for (const r of data.results) {
      if (!batch.some((t) => t.id === r.id)) continue
      const account = r.account_code ? byCode.get(r.account_code) : undefined
      out.set(r.id, { accountId: account?.id ?? null, confidence: account ? r.confidence : 0 })
    }
  }
  return out
}
