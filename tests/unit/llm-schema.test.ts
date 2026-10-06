import { describe, expect, it } from "vitest"
import { strictJsonSchema } from "@/ingest/llm/client"
import { pageSchema } from "@/ingest/pdf/extract"

describe("strict JSON schema for structured outputs", () => {
  it("requires every property and forbids extras at every level", () => {
    const schema = strictJsonSchema(pageSchema) as { required: string[]; additionalProperties: boolean; properties: { transactions: { items: { required: string[]; additionalProperties: boolean } } } }
    expect(schema.additionalProperties).toBe(false)
    expect(schema.required).toEqual(["currency", "opening_balance", "closing_balance", "transactions"])
    expect(schema.properties.transactions.items.additionalProperties).toBe(false)
    expect(schema.properties.transactions.items.required).toContain("balance")
    expect(JSON.stringify(schema)).not.toContain("$schema")
  })
})
