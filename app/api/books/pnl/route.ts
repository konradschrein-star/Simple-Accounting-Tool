import type { NextRequest } from "next/server"
import { computePnl } from "@/bookkeeping/pnl"
import { RANGE_KEYS, reportRange, type RangeKey } from "@/bookkeeping/ranges"
import { db } from "@/db/client"
import { requireReadyOrg } from "@/server/context"
import { pnlInputs } from "@/server/repos/books"
import { listAccounts } from "@/server/repos/ledger"

const csvCell = (v: string | number) => (typeof v === "number" ? (v / 100).toFixed(2) : `"${v.replace(/"/g, '""')}"`)

/** P&L as CSV for the accountant / tax return. */
export async function GET(request: NextRequest) {
  const ctx = await requireReadyOrg()
  const param = request.nextUrl.searchParams.get("range")
  const key: RangeKey = RANGE_KEYS.includes(param as RangeKey) ? (param as RangeKey) : "ytd"
  const range = reportRange(key, ctx.today)
  const pnl = computePnl({ ...pnlInputs(db, ctx.orgId), accounts: listAccounts(db, ctx.orgId), ...range })
  const rows: (string | number)[][] = [["Section", "Code", "Account", "Tax line", `${range.period.from}..${range.period.to}`, `${range.prior.from}..${range.prior.to}`]]
  for (const l of pnl.income) rows.push(["Income", l.code, l.name, l.taxLine ?? "", l.amountMinor, l.priorMinor])
  rows.push(["Total income", "", "", "", pnl.incomeMinor, pnl.priorIncomeMinor])
  for (const l of pnl.expenses) rows.push(["Expenses", l.code, l.name, l.taxLine ?? "", l.amountMinor, l.priorMinor])
  rows.push(["Total expenses", "", "", "", pnl.expensesMinor, pnl.priorExpensesMinor])
  rows.push(["Net result", "", "", "", pnl.netMinor, pnl.priorNetMinor])
  const csv = "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n")
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="pnl-${range.period.from}-${range.period.to}.csv"` },
  })
}
