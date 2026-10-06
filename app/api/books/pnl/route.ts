import type { NextRequest } from "next/server"
import { computePnl } from "@/bookkeeping/pnl"
import { parseRangeKey, reportRange } from "@/bookkeeping/ranges"
import { db } from "@/db/client"
import { csvResponse } from "@/lib/csv"
import { requireReadyOrg } from "@/server/context"
import { pnlInputs } from "@/server/repos/books"
import { listAccounts } from "@/server/repos/ledger"

const major = (minor: number) => (minor / 100).toFixed(2)

/** P&L as CSV for the accountant / tax return. */
export async function GET(request: NextRequest) {
  const ctx = await requireReadyOrg()
  const range = reportRange(parseRangeKey(request.nextUrl.searchParams.get("range")), ctx.today)
  const pnl = computePnl({ ...pnlInputs(db, ctx.orgId), accounts: listAccounts(db, ctx.orgId), ...range })
  const rows: unknown[][] = [["Section", "Code", "Account", "Tax line", `${range.period.from}..${range.period.to}`, `${range.prior.from}..${range.prior.to}`]]
  for (const l of pnl.income) rows.push(["Income", l.code, l.name, l.taxLine ?? "", major(l.amountMinor), major(l.priorMinor)])
  rows.push(["Total income", "", "", "", major(pnl.incomeMinor), major(pnl.priorIncomeMinor)])
  for (const l of pnl.expenses) rows.push(["Expenses", l.code, l.name, l.taxLine ?? "", major(l.amountMinor), major(l.priorMinor)])
  rows.push(["Total expenses", "", "", "", major(pnl.expensesMinor), major(pnl.priorExpensesMinor)])
  rows.push(["Net result", "", "", "", major(pnl.netMinor), major(pnl.priorNetMinor)])
  return csvResponse(`pnl-${range.period.from}-${range.period.to}.csv`, rows)
}
