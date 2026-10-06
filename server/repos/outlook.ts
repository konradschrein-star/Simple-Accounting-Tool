import { and, eq, gt, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm"
import { cashOutlook, topCategories, type CashOutlook } from "@/advisory/cash-outlook"
import { OUTFLOW_KINDS, type Metrics } from "@/advisory/metrics"
import type { Db } from "@/db/client"
import { invoices, ledgerAccounts, recurringSeries, transactions } from "@/db/schema"
import type { IsoDate } from "@/lib/dates"
import { toBaseMinor } from "@/lib/money"
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
    receivables: metrics.receivables,
    scheduled: scheduled.map((s) => ({ date: s.date, amountMinor: toBaseMinor(s.totalMinor, s.fx) })),
    today,
  })
}

/**
 * Money out per account in [from, to], counted exactly like the Expenses tile (`OUTFLOW_KINDS`, refunds net out);
 * uncategorized payments get their own bucket so nothing hides.
 */
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
        or(inArray(ledgerAccounts.kind, OUTFLOW_KINDS), and(isNull(transactions.ledgerAccountId), lt(transactions.amountMinor, 0)))
      )
    )
    .groupBy(sql`1`)
    .all()
  return topCategories(rows.map((r) => ({ name: r.name, amountMinor: Number(r.total) })))
}
