import { db } from "@/db/client"
import { csvResponse } from "@/lib/csv"
import { requireAdmin } from "@/server/context"
import { leadRows } from "@/server/repos/admin"

export async function GET() {
  await requireAdmin()
  const header = [
    "Workspace",
    "Owner",
    "Email",
    "Country",
    "Currency",
    "Opted in",
    "Demo",
    "Lifetime invoiced",
    "12m cash in",
    "12m expenses",
    "12m margin %",
    "Active alerts",
    "Request",
    "Request status",
    "Requested at",
  ]
  const rows = leadRows(db).map((l) => [
    l.orgName,
    l.ownerName,
    l.ownerEmail,
    l.jurisdiction,
    l.currency,
    l.optedIn ? "yes" : "no",
    l.isDemo ? "yes" : "no",
    (l.lifetimeInvoicedMinor / 100).toFixed(2),
    (l.trailing12CashInMinor / 100).toFixed(2),
    (l.trailing12ExpensesMinor / 100).toFixed(2),
    l.trailing12MarginBp === null ? "" : (l.trailing12MarginBp / 100).toFixed(1),
    l.activeAlerts,
    l.request?.kind,
    l.request?.status,
    l.request?.createdAt.toISOString(),
  ])
  return csvResponse(`leads-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows])
}
