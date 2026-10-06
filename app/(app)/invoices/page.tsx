import type { Metadata } from "next"
import { DocumentList, NewDocumentButton } from "@/components/invoices/document-list"
import { RecurringList } from "@/components/invoices/recurring-list"
import { PageBody, PageHeader } from "@/components/shell/page-header"
import { PageTabs, parseTab } from "@/components/shell/page-tabs"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { workspaceMetrics } from "@/advisory/evaluate"
import { db } from "@/db/client"
import { formatMoney } from "@/lib/money"
import { cn } from "@/lib/utils"
import { requireReadyOrg } from "@/server/context"

export const metadata: Metadata = { title: "Invoices" }

const TABS = [
  ["invoices", "Invoices"],
  ["credit-notes", "Credit notes"],
  ["recurring", "Recurring"],
] as const

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await requireReadyOrg()
  const tab = parseTab(TABS, (await searchParams).tab)
  const { currency, locale } = ctx.settings
  const metrics = workspaceMetrics(db, ctx.orgId, ctx.today)
  const stats = [
    { label: "Outstanding", value: metrics.outstandingMinor, hint: "Finalized, not yet paid" },
    {
      label: "Overdue",
      value: metrics.overdueMinor,
      hint: `${metrics.overdueCount} invoice${metrics.overdueCount === 1 ? "" : "s"} past due`,
      tone: "text-destructive",
    },
    { label: "Collected this month", value: metrics.thisMonth.cashInMinor, hint: "Payments and bank income", tone: "text-success" },
  ]
  return (
    <PageBody>
      <PageHeader
        title="Invoices"
        description="Create, send and get paid — with credit notes and recurring billing built in."
        actions={<NewDocumentButton kind="invoice" />}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader>
              <CardDescription>{s.label}</CardDescription>
              <CardTitle className={cn("text-2xl tabular-nums", s.value ? s.tone : undefined)}>{formatMoney(s.value, currency, locale)}</CardTitle>
              <CardDescription className="text-xs">{s.hint}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
      <PageTabs basePath="/invoices" tabs={TABS} current={tab} />
      {tab === "invoices" ? (
        <DocumentList ctx={ctx} kind="invoice" />
      ) : tab === "credit-notes" ? (
        <DocumentList ctx={ctx} kind="credit_note" />
      ) : (
        <RecurringList ctx={ctx} />
      )}
    </PageBody>
  )
}
