import { describe, expect, it } from "vitest"
import { computeMetrics, type MetricInvoice, type MetricTransaction } from "@/advisory/metrics"
import { evaluateAlerts } from "@/advisory/triggers"
import { JURISDICTIONS, type TaxProfile } from "@/jurisdictions"

const TODAY = "2026-10-06"
const profile: TaxProfile = { taxRegistered: true, smallBusinessExempt: false, vatFilingFrequency: "quarterly", vatPeriodEndMonth: 3, deDauerfrist: false }
const inv = (id: string, totalMinor: number, issueDate: string, status: MetricInvoice["status"] = "finalized", paidDate: string | null = null): MetricInvoice => ({
  id,
  status,
  issueDate,
  dueDate: issueDate,
  paidDate,
  totalMinor,
})
const txn = (date: string, amountMinor: number, kind: MetricTransaction["kind"], invoiceId: string | null = null): MetricTransaction => ({ date, amountMinor, kind, invoiceId })

describe("metrics", () => {
  const invoices = [inv("a", 500000, "2026-09-01", "paid", "2026-09-20"), inv("b", 200000, "2026-10-02"), inv("d", 999999, "2026-10-01", "draft")]
  const txns = [
    txn("2026-09-20", 500000, "income", "a"), // pays invoice a — must not double count
    txn("2026-10-03", 30000, null), // uncategorized credit → sign heuristic
    txn("2026-10-04", -120000, "expense"),
    txn("2026-10-05", -50000, "tax"),
    txn("2026-10-05", -100000, "transfer"),
    txn("2026-10-05", -40000, "owner"),
  ]
  const m = computeMetrics(invoices, txns, TODAY)

  it("counts finalized/paid invoices, never drafts", () => {
    expect(m.lifetime.invoicedMinor).toBe(700000)
    expect(m.thisMonth.invoicedMinor).toBe(200000)
  })
  it("does not double count invoice payments that appear on the bank statement", () => {
    expect(m.lifetime.cashInMinor).toBe(530000)
  })
  it("excludes transfers and owner movements from expenses", () => {
    expect(m.thisMonth.expensesMinor).toBe(170000)
    expect(m.thisMonth.netMinor).toBe(30000 - 170000)
  })
  it("tracks outstanding, overdue and uncategorized", () => {
    expect(m.outstandingMinor).toBe(200000)
    expect(m.overdueCount).toBe(1)
    expect(m.uncategorizedCount).toBe(1)
    expect(m.months).toHaveLength(12)
    expect(m.months.at(-1)?.month).toBe("2026-10")
  })
})

describe("advisory triggers", () => {
  const base = { jurisdiction: JURISDICTIONS.de, profile, today: TODAY, marginThresholdBp: 2500 }

  it("fires the lifetime milestone exactly at the threshold", () => {
    const below = computeMetrics([inv("a", 999_999, "2026-09-01")], [], TODAY)
    const at = computeMetrics([inv("a", 1_000_000, "2026-09-01")], [], TODAY)
    expect(evaluateAlerts({ ...base, metrics: below }).some((a) => a.type === "milestone_lifetime")).toBe(false)
    expect(evaluateAlerts({ ...base, metrics: at }).map((a) => a.dedupeKey)).toContain("milestone:lifetime")
  })

  it("fires a monthly milestone keyed by month", () => {
    const m = computeMetrics([inv("a", 600_000, "2026-10-01"), inv("b", 500_000, "2026-10-03")], [], TODAY)
    expect(evaluateAlerts({ ...base, metrics: m }).map((a) => a.dedupeKey)).toContain("milestone:month:2026-10")
  })

  it("margin alert needs 30 days of history and real cash in", () => {
    const thin = computeMetrics([], [txn("2026-10-01", 100000, "income"), txn("2026-10-02", -90000, "expense")], TODAY)
    expect(evaluateAlerts({ ...base, metrics: thin }).some((a) => a.type === "margin_low")).toBe(false)
    const history = computeMetrics([], [txn("2026-08-01", 100000, "income"), txn("2026-09-15", -90000, "expense")], TODAY)
    const alert = evaluateAlerts({ ...base, metrics: history }).find((a) => a.type === "margin_low")
    expect(alert).toMatchObject({ dedupeKey: "margin:2026-10", payload: { marginBp: 1000 } })
    const healthy = computeMetrics([], [txn("2026-08-01", 100000, "income"), txn("2026-09-15", -50000, "expense")], TODAY)
    expect(evaluateAlerts({ ...base, metrics: healthy }).some((a) => a.type === "margin_low")).toBe(false)
  })

  it("tax deadline alerts within 21 days (DE USt-VA Q3 due 12 Oct 2026)", () => {
    const alerts = evaluateAlerts({ ...base, metrics: computeMetrics([], [], TODAY) }).filter((a) => a.type === "tax_deadline")
    expect(alerts.map((a) => a.dedupeKey)).toEqual(["tax:de-ustva-2026-Q3"])
    expect(alerts[0].payload).toMatchObject({ daysLeft: 6 })
  })
})

describe("alert ranking", () => {
  it("puts risk first, keeps only the newest milestone month, caps the list", async () => {
    const { rankAlerts } = await import("@/advisory/triggers")
    const alerts = [
      { type: "milestone_lifetime" as const, dedupeKey: "milestone:lifetime" },
      { type: "milestone_month" as const, dedupeKey: "milestone:month:2026-09" },
      { type: "milestone_month" as const, dedupeKey: "milestone:month:2026-10" },
      { type: "tax_deadline" as const, dedupeKey: "tax:x" },
      { type: "margin_low" as const, dedupeKey: "margin:2026-10" },
    ]
    const { shown, hidden } = rankAlerts(alerts, 3)
    expect(shown.map((a) => a.dedupeKey)).toEqual(["margin:2026-10", "tax:x", "milestone:month:2026-10"])
    expect(hidden).toBe(1)
  })
})
