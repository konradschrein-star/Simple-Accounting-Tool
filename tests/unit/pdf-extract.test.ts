import { describe, expect, it } from "vitest"
import type { LlmPort } from "@/ingest/llm/client"
import { extractStatement } from "@/ingest/pdf/extract"

const PAGE = `Kontoauszug 10/2026      Alter Kontostand 1.000,00 EUR
01.10.2026  Gutschrift Kunde GmbH  RE INV-2026-0001        1.487,50
02.10.2026  Lastschrift Hausverwaltung Miete Oktober        850,00-
Neuer Kontostand 1.637,50 EUR ${"x".repeat(150)}`

const good = {
  currency: "EUR",
  opening_balance: 1000,
  closing_balance: 1637.5,
  transactions: [
    { date: "2026-10-01", description: "RE INV-2026-0001", counterparty: "Kunde GmbH", amount_text: "1.487,50", amount: 1487.5, type: "credit" as const, balance: null },
    { date: "2026-10-02", description: "Miete Oktober", counterparty: "Hausverwaltung", amount_text: "850,00-", amount: 850, type: "debit" as const, balance: null },
  ],
}
// The cheap model misreads the debit as a credit — the balances expose it.
const wrongSign = { ...good, transactions: [good.transactions[0], { ...good.transactions[1], type: "credit" as const }] }

function fakeLlm(byModel: Record<string, unknown>): LlmPort & { calls: string[] } {
  const calls: string[] = []
  const port = (async (req: { model: string }) => {
    calls.push(req.model)
    return { data: byModel[req.model], model: req.model }
  }) as unknown as LlmPort & { calls: string[] }
  port.calls = calls
  return port
}

const models = { text: "text-model", vision: "vision-model", escalation: "big-vision" }

describe("PDF statement extraction", () => {
  it("parses a digital statement with the text model and reconciles it", async () => {
    const llm = fakeLlm({ "text-model": good })
    const result = await extractStatement({ llm, models, pageTexts: [PAGE], renderImages: async () => [] })
    expect(result.parser).toBe("pdf_text")
    expect(result.reconciliation.ok).toBe(true)
    expect(result.rows.map((r) => [r.date, r.amountMinor, r.issues])).toEqual([
      ["2026-10-01", 148750, []],
      ["2026-10-02", -85000, []],
    ])
    expect(llm.calls).toEqual(["text-model"])
  })

  it("escalates to the larger vision model when balances do not reconcile", async () => {
    const llm = fakeLlm({ "text-model": wrongSign, "big-vision": good })
    const result = await extractStatement({ llm, models, pageTexts: [PAGE], renderImages: async () => [Buffer.from("png")] })
    expect(llm.calls).toEqual(["text-model", "big-vision"])
    expect(result.model).toBe("big-vision")
    expect(result.reconciliation.ok).toBe(true)
    expect(result.attempts).toBe(2)
  })

  it("uses the vision model for scans without a text layer", async () => {
    const llm = fakeLlm({ "vision-model": good })
    const result = await extractStatement({ llm, models, pageTexts: [""], renderImages: async () => [Buffer.from("png")] })
    expect(result.parser).toBe("pdf_vision")
    expect(llm.calls).toEqual(["vision-model"])
  })
})
