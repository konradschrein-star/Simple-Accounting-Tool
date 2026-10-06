import { describe, expect, it } from "vitest"
import { allowedActions, assertAllowed } from "@/invoicing/lifecycle"

const TODAY = "2026-10-06"
const doc = (
  kind: "invoice" | "quote" | "credit_note" | "recurring_template",
  status: Parameters<typeof allowedActions>[0]["status"],
  dueDate = "2026-10-20"
) => ({
  kind,
  status,
  dueDate,
  totalMinor: 10_000,
})
const actions = (d: ReturnType<typeof doc>, paid = 0) => [...allowedActions(d, TODAY, paid)].sort()

describe("document lifecycle rules", () => {
  it("drafts can be edited, issued, deleted and copied — nothing else", () => {
    expect(actions(doc("invoice", "draft"))).toEqual(["delete", "duplicate", "edit", "finalize"])
  })
  it("recurring templates can only be edited", () => {
    expect(actions(doc("recurring_template", "draft"))).toEqual(["edit"])
  })
  it("open invoices take payments until covered; paid ones can only lose payments", () => {
    expect(actions(doc("invoice", "finalized"))).toEqual(["cancel", "duplicate", "makeRecurring", "pay", "send", "share"])
    expect(actions(doc("invoice", "finalized"), 4_000)).toContain("removePayment")
    expect(actions(doc("invoice", "paid"), 10_000)).not.toContain("pay")
    expect(actions(doc("invoice", "cancelled"))).toEqual(["duplicate", "share"])
  })
  it("clients may answer a quote only while it is valid; the owner decides any time until converted", () => {
    expect(actions(doc("quote", "finalized"))).toContain("respond")
    expect(actions(doc("quote", "finalized", "2026-10-01"))).not.toContain("respond")
    expect(actions(doc("quote", "finalized", "2026-10-01"))).toEqual(expect.arrayContaining(["accept", "decline", "convert"]))
    expect(actions(doc("quote", "accepted"))).not.toContain("accept")
    expect(actions(doc("quote", "converted"))).toEqual(["duplicate", "share"])
  })
  it("credit notes are sent and shared, never paid, cancelled or copied", () => {
    expect(actions(doc("credit_note", "finalized"))).toEqual(["send", "share"])
  })
  it("refuses with a reason", () => {
    expect(() => assertAllowed(doc("invoice", "paid"), TODAY, 10_000, "pay")).toThrow(/can’t take a payment/)
  })
})
