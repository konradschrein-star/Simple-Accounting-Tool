import { and, eq, gt, gte, isNull, lt, lte, or, sql } from "drizzle-orm"
import { cashOutlook, topCategories, type CashOutlook } from "@/advisory/cash-outlook"
import type { Metrics } from "@/advisory/metrics"
import type { Db } from "@/db/client"
import { invoices, ledgerAccounts, recurringSeries, transactions } from "@/db/schema"
import { openAmount } from "@/invoicing/documents"
import type { IsoDate } from "@/lib/dates"
import { toBaseMinor } from "@/lib/money"
import { paidAmounts } from "./invoices"
import type { WorkspaceSettings } from "./workspace"

export function workspaceOutlook(db: Db, orgId: string, settings: WorkspaceSettings, metrics: Metrics, today: IsoDate): CashOutlook {
  const balance =
    settings.bankBalanceMinor !== null && settings.bankBalanceDate ? { amountMinor: settings.bankBalanceMinor, date: settings.bankBalanceDate } : null
  const movementsSinceMinor = balance
    ? Number(
        db
          .select({ total: sql<number>`coalesce(sum(${transactions.amountMinor}), 0)` })
          .from(transactions)
          .where(and(eq(transactions.orgId, orgId), gt(transactions.date, balance.date)))
          .get()?.total ?? 0
      )
    : 0
  const open = db
    .select({ id: invoices.id, dueDate: invoices.dueDate, totalMinor: invoices.totalMinor, fx: invoices.fxRateMicro })
    .from(invoices)
    .where(and(eq(invoices.orgId, orgId), eq(invoices.kind, "invoice"), eq(invoices.status, "finalized")))
    .all()
  const paid = paidAmounts(
    db,
    orgId,
    open.map((i) => i.id)
  )
  const scheduled = db
    .select({ date: recurringSeries.nextIssueDate, totalMinor: invoices.totalMinor, fx: invoices.fxRateMicro })
    .from(recurringSeries)
    .innerJoin(invoices, eq(invoices.id, recurringSeries.templateInvoiceId))
    .where(and(eq(recurringSeries.orgId, orgId), eq(recurringSeries.state, "active")))
    .all()
  return cashOutlook({
    balance,
    movementsSinceMinor,
    months: metrics.months,
    receivables: open.map((i) => ({ dueDate: i.dueDate, openMinor: toBaseMinor(openAmount(i.totalMinor, paid.get(i.id) ?? 0), i.fx) })),
    scheduled: scheduled.map((s) => ({ date: s.date, amountMinor: toBaseMinor(s.totalMinor, s.fx) })),
    today,
  })
}

/** Money out per expense account in [from, to]; uncategorized payments get their own bucket so nothing hides. */
export function spendingByCategory(db: Db, orgId: string, from: IsoDate, to: IsoDate) {
  const rows = db
    .select({ name: sql<string>`coalesce(${ledgerAccounts.name}, 'Not yet categorized')`, total: sql<number>`sum(-${transactions.amountMinor})` })
    .from(transactions)
    .leftJoin(ledgerAccounts, eq(ledgerAccounts.id, transactions.ledgerAccountId))
    .where(
      and(
        eq(transactions.orgId, orgId),
        gte(transactions.date, from),
        lte(transactions.date, to),
        lt(transactions.amountMinor, 0),
        or(eq(ledgerAccounts.kind, "expense"), isNull(transactions.ledgerAccountId))
      )
    )
    .groupBy(sql`1`)
    .all()
  return topCategories(rows.map((r) => ({ name: r.name, amountMinor: Number(r.total) })))
}
