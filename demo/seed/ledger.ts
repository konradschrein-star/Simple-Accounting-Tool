import { createHash } from "node:crypto"
import { workspaceMetrics } from "@/advisory/evaluate"
import { addDays, addMonths, dayOfMonth, lastDayOfMonth, monthKey } from "@/lib/dates"
import { recordPayment } from "@/server/repos/invoice-payments"
import { createRule, insertTransactions, type NewLedgerRow } from "@/server/repos/ledger"
import { byRole, type SeedContext } from "./context"
import type { PaidInvoice } from "./invoices"

/** A demo bank line (always with text) and, once booked, its id. */
type DemoRow = NewLedgerRow & { counterparty: string; description: string }
export type BookedRow = { id: string; row: DemoRow; accountCode: string | null }

/** The margin the 90-day story lands on: low enough to trigger the "margin dropped" alert. */
const DEMO_MARGIN_BP = 1500

/**
 * The bank side: payments for paid invoices (recorded exactly as a committed statement would), recurring vendors,
 * owner drawings, savings transfers, and recent one-offs waiting in the review queue with AI suggestions.
 */
export function seedLedger(ctx: SeedContext, paid: PaidInvoice[]): BookedRow[] {
  const { db, orgId, today, persona, jurisdiction, random } = ctx
  const incomeAccount = jurisdiction.chartOfAccounts.find((a) => a.kind === "income")!.code
  const planned: { row: Omit<DemoRow, "dedupeHash" | "ledgerAccountId">; accountCode: string | null; paysInvoice?: PaidInvoice }[] = []
  const ok = { reviewStatus: "ok" as const }

  for (const p of paid)
    planned.push({
      row: {
        date: p.paidDate,
        description: `Payment ${p.number}`,
        counterparty: p.clientName,
        amountMinor: p.totalMinor,
        categorizationSource: "heuristic",
        invoiceId: p.id,
        ...ok,
      },
      accountCode: incomeAccount,
      paysInvoice: p,
    })
  for (let offset = -8; offset <= 0; offset++) {
    const [y, m] = addMonths(monthKey(today), offset).split("-").map(Number)
    for (const v of persona.vendors) {
      const date = dayOfMonth(y, m, v.day)
      if ((v.every === "quarter" && m % 3 !== 1) || date > today) continue
      const source = random() > 0.4 ? ("rule" as const) : ("ai" as const)
      planned.push({
        row: { date, description: v.description, counterparty: v.counterparty, amountMinor: -v.amountMinor, categorizationSource: source, ...ok },
        accountCode: v.accountCode,
      })
    }
    const drawDate = dayOfMonth(y, m, 25)
    if (drawDate > today) continue
    const draw = -(200000 + Math.round(random() * 50000))
    planned.push({
      row: { date: drawDate, description: "Owner drawing", counterparty: persona.owner, amountMinor: draw, categorizationSource: "rule", ...ok },
      accountCode: persona.ownerCode,
    })
    if (m % 3 === 0)
      planned.push({
        row: {
          date: lastDayOfMonth(y, m),
          description: "Transfer to savings",
          counterparty: persona.owner,
          amountMinor: -300000,
          categorizationSource: "heuristic",
          ...ok,
        },
        accountCode: persona.transferCode,
      })
  }
  persona.recentOneOffs.forEach((o, i) =>
    planned.push({
      row: {
        date: addDays(today, -3 - i * 5),
        description: o.description,
        counterparty: o.counterparty,
        amountMinor: -o.amountMinor,
        categorizationSource: "ai",
        aiConfidenceBp: Math.round(o.confidence * 10000),
        reviewStatus: "needs_review",
      },
      accountCode: o.suggestedCode,
    })
  )

  const rows = planned.map((p, i) => ({
    ...p.row,
    ledgerAccountId: p.accountCode ? ctx.accountId(p.accountCode) : null,
    dedupeHash: demoHash(orgId, String(i)),
  }))
  const ids = insertTransactions(db, orgId, rows)
  planned.forEach((p, i) => {
    if (p.paysInvoice)
      recordPayment(db, orgId, p.paysInvoice.id, { date: p.row.date, amountMinor: p.row.amountMinor, method: "bank", transactionId: ids[i].id }, today)
  })
  return rows.map((row, i) => ({ id: ids[i].id, row, accountCode: planned[i].accountCode }))
}

/** Sizes one subcontractor bill so the 90-day margin lands near 15 % — the story needs a visible squeeze. */
export function squeezeMargin(ctx: SeedContext) {
  const t90 = workspaceMetrics(ctx.db, ctx.orgId, ctx.today).trailing90
  const topUp = Math.round(t90.cashInMinor * (1 - DEMO_MARGIN_BP / 10000)) - t90.expensesMinor
  if (topUp <= 0) return
  const contractor = byRole(ctx.persona.recentOneOffs, "contractor", "one-off")
  insertTransactions(ctx.db, ctx.orgId, [
    {
      date: addDays(ctx.today, -30),
      description: `${contractor.description} – project delivery`,
      counterparty: contractor.counterparty,
      amountMinor: -topUp,
      ledgerAccountId: ctx.accountId(contractor.suggestedCode),
      categorizationSource: "rule",
      reviewStatus: "ok",
      dedupeHash: demoHash(ctx.orgId, "topup"),
    },
  ])
}

/** Rules for the first recurring vendors, as if the owner had confirmed them. */
export function seedRules(ctx: SeedContext) {
  for (const v of ctx.persona.vendors.slice(0, 3))
    createRule(ctx.db, ctx.orgId, {
      matchField: "counterparty",
      matchType: "equals",
      pattern: v.counterparty,
      sign: "debit",
      ledgerAccountId: ctx.accountId(v.accountCode),
    })
}

const demoHash = (orgId: string, key: string) => createHash("sha256").update(`demo|${orgId}|${key}`).digest("hex")
