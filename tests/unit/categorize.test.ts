import { describe, expect, it } from "vitest"
import { suggestAccounts } from "@/bookkeeping/ai-categorize"
import { categorizeDeterministic, suggestRule, type AccountRef, type Rule } from "@/bookkeeping/categorize"
import type { LlmPort } from "@/ingest/llm/client"

const accounts: AccountRef[] = [
  { id: "inc", code: "8400", name: "Erlöse 19 %", kind: "income", taxLine: null },
  { id: "rent", code: "4210", name: "Miete", kind: "expense", taxLine: null },
  { id: "soft", code: "4806", name: "Software", kind: "expense", taxLine: null },
  { id: "tax", code: "1780", name: "USt-Zahlungen", kind: "tax", taxLine: null },
  { id: "trf", code: "1360", name: "Geldtransit", kind: "transfer", taxLine: null },
]
const txn = (id: string, description: string, amountMinor: number, counterparty = "", invoiceId: string | null = null) => ({ id, description, counterparty, amountMinor, invoiceId })
const rule = (over: Partial<Rule>): Rule => ({ id: "r1", matchField: "counterparty", matchType: "equals", pattern: "Adobe", sign: "any", ledgerAccountId: "soft", priority: 100, approved: true, ...over })

describe("deterministic categorization", () => {
  it("invoice-matched credits are income, transfers and tax are recognised", () => {
    const result = categorizeDeterministic(
      [txn("a", "RE INV-1", 148750, "Kunde", "inv1"), txn("b", "Umbuchung Tagesgeld", -50000), txn("c", "USt-VA Q3", -120000, "Finanzamt Berlin")],
      accounts,
      [],
    )
    expect(Object.fromEntries([...result].map(([k, v]) => [k, v.accountId]))).toEqual({ a: "inc", b: "trf", c: "tax" })
  })

  it("rules apply by priority and respect sign and approval", () => {
    const rules = [rule({ id: "low", priority: 200, ledgerAccountId: "rent" }), rule({ id: "high", priority: 10 }), rule({ id: "unapproved", priority: 1, approved: false, ledgerAccountId: "tax" })]
    const result = categorizeDeterministic([txn("a", "Creative Cloud", -6645, "ADOBE GmbH")], accounts, rules)
    expect(result.get("a")).toEqual({ accountId: "soft", source: "rule", ruleId: "high" })
    const creditOnly = categorizeDeterministic([txn("a", "x", -100, "Adobe")], accounts, [rule({ sign: "credit" })])
    expect(creditOnly.size).toBe(0)
  })

  it("leaves unknown lines for the AI pass", () => {
    expect(categorizeDeterministic([txn("a", "Kartenzahlung Restaurant", -4590)], accounts, []).size).toBe(0)
  })

  it("suggests counterparty rules from corrections", () => {
    expect(suggestRule(txn("a", "Miete Oktober", -85000, "Hausverwaltung Schmidt"), "rent")).toMatchObject({ matchField: "counterparty", pattern: "Hausverwaltung Schmidt", sign: "debit" })
  })
})

describe("AI categorization", () => {
  it("maps codes to accounts and drops unknown codes", async () => {
    const llm: LlmPort = async () => ({
      model: "m",
      data: { results: [{ id: "a", account_code: "4210", confidence: 0.93 }, { id: "b", account_code: "9999", confidence: 0.9 }] } as never,
    })
    const out = await suggestAccounts({ llm, model: "m", accounts, examples: [], currency: "EUR", txns: [txn("a", "Miete", -85000), txn("b", "???", -100)] })
    expect(out.get("a")).toEqual({ accountId: "rent", confidence: 0.93 })
    expect(out.get("b")).toEqual({ accountId: null, confidence: 0 })
  })
})
