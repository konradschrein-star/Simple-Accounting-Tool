import { AlertTriangleIcon, ArrowRightIcon, CalendarClockIcon, CompassIcon, FileTextIcon, UploadIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { workspaceMetrics } from "@/advisory/evaluate"
import { rankAlerts } from "@/advisory/triggers"
import type { PeriodMetrics } from "@/advisory/metrics"
import { AlertCards, type AlertView } from "@/components/dashboard/alert-cards"
import { BookkeepingOffer } from "@/components/dashboard/bookkeeping-offer"
import { CashflowChart } from "@/components/dashboard/cashflow-chart"
import { GrowthPlanButton } from "@/components/dashboard/growth-plan-button"
import { PageBody, PageHeader } from "@/components/shell/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/db/client"
import { addDays, daysBetween, formatDate } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import { cn } from "@/lib/utils"
import { requireReadyOrg } from "@/server/context"
import { activeAlerts } from "@/server/repos/advisory"
import { currentEngagement } from "@/server/repos/engagements"
import { taxProfileOf } from "@/server/repos/workspace"

export const metadata: Metadata = { title: "Dashboard" }

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const ctx = await requireReadyOrg()
  const { period = "year" } = await searchParams
  const metrics = workspaceMetrics(db, ctx.orgId, ctx.today)
  const { currency, locale } = ctx.settings
  const money = (m: number) => formatMoney(m, currency, locale)
  const p: PeriodMetrics = period === "month" ? metrics.thisMonth : metrics.trailing12
  const { shown: alerts, hidden: hiddenAlerts } = rankAlerts(activeAlerts(db, ctx.orgId), 3)
  const deadlines = ctx.jurisdiction.taxDeadlines(taxProfileOf(ctx.settings), ctx.today, addDays(ctx.today, 90)).slice(0, 4)
  const engagement = currentEngagement(db, ctx.orgId)
  const empty = metrics.firstActivity === null

  const tiles = [
    { label: "Invoiced", value: money(p.invoicedMinor), hint: "Finalized invoices by issue date" },
    { label: "Cash collected", value: money(p.cashInMinor), hint: "Business income received" },
    { label: "Expenses", value: money(p.expensesMinor), hint: "Excl. transfers and private" },
    {
      label: "Net margin",
      value: p.marginBp === null ? "—" : `${(p.marginBp / 100).toLocaleString(locale, { maximumFractionDigits: 1 })} %`,
      hint: `Net ${money(p.netMinor)}`,
      warn: p.marginBp !== null && p.marginBp < 2500,
    },
  ]

  return (
    <PageBody>
      <PageHeader
        title={`Welcome back, ${ctx.user.name.split(" ")[0] || "there"}`}
        description={`Cash-flow overview for ${ctx.orgName}`}
        actions={
          <div className="flex rounded-lg border p-0.5">
            {[
              ["month", "This month"],
              ["year", "Last 12 months"],
            ].map(([key, label]) => (
              <Button key={key} asChild size="sm" variant={period === key ? "secondary" : "ghost"}>
                <Link href={`/dashboard?period=${key}`}>{label}</Link>
              </Button>
            ))}
          </div>
        }
      />

      {empty ? (
        <Card className="border-primary/30 bg-gradient-to-br from-primary/10 to-transparent">
          <CardHeader>
            <CardTitle>Let’s get your numbers in</CardTitle>
            <CardDescription>Two steps and your dashboard comes alive.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Button asChild variant="outline" className="h-auto justify-start gap-3 py-3">
              <Link href="/invoices">
                <FileTextIcon /> <span className="text-left">Create your first invoice<br /><span className="text-xs text-muted-foreground">Compliant PDF in 60 seconds</span></span>
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-auto justify-start gap-3 py-3">
              <Link href="/imports">
                <UploadIcon /> <span className="text-left">Import a bank statement<br /><span className="text-xs text-muted-foreground">CSV or PDF — no bank login</span></span>
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <AlertCards alerts={alerts.map((a) => ({ id: a.id, type: a.type, payload: a.payload }) satisfies AlertView)} currency={currency} locale={locale} />
      {hiddenAlerts ? <p className="-mt-2 text-xs text-muted-foreground">+ {hiddenAlerts} more insight{hiddenAlerts > 1 ? "s" : ""} — dismiss one to see the next.</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label} className="gap-1">
            <CardHeader>
              <CardDescription>{t.label}</CardDescription>
              <CardTitle className="flex items-center gap-2 text-3xl font-semibold tabular-nums">
                {t.value}
                {t.warn ? <AlertTriangleIcon className="size-5 text-destructive" aria-label="Below 25 %" /> : null}
              </CardTitle>
              <CardDescription className="text-xs">{t.hint}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cash in vs. expenses</CardTitle>
            <CardDescription>Last 12 months</CardDescription>
          </CardHeader>
          <CardContent>
            <CashflowChart
              currency={currency}
              locale={locale}
              data={metrics.months.map((m) => ({ month: m.month, cashIn: m.cashInMinor, expenses: m.expensesMinor }))}
            />
            {metrics.uncategorizedCount ? (
              <p className="mt-3 text-xs text-muted-foreground">
                {metrics.uncategorizedCount} transactions not yet categorized are counted by sign.{" "}
                <Link href="/review" className="underline underline-offset-4">Review them</Link>
              </p>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClockIcon className="size-4" /> Upcoming tax dates
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {deadlines.length ? (
                deadlines.map((d) => (
                  <div key={d.id} className="flex items-start justify-between gap-3 text-sm">
                    <div>
                      <div className="font-medium">{d.title}</div>
                      <div className="text-xs text-muted-foreground">{d.detail}</div>
                    </div>
                    <div className={cn("shrink-0 text-right tabular-nums", daysBetween(ctx.today, d.date) <= 14 && "font-medium text-destructive")}>
                      {formatDate(d.date, locale, "short")}
                      <div className="text-xs text-muted-foreground">in {daysBetween(ctx.today, d.date)} d</div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Nothing due in the next 90 days.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Receivables</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Outstanding</span>
                <span className="font-medium tabular-nums">{money(metrics.outstandingMinor)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Overdue ({metrics.overdueCount})</span>
                <span className={cn("font-medium tabular-nums", metrics.overdueMinor && "text-destructive")}>{money(metrics.overdueMinor)}</span>
              </div>
              <Button asChild variant="link" className="h-auto px-0">
                <Link href="/invoices?status=overdue">
                  Chase overdue invoices <ArrowRightIcon />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <BookkeepingOffer uncategorized={metrics.uncategorizedCount} status={(engagement?.status as "requested" | "active" | "paused" | undefined) ?? "none"} />

          <Card className="bg-muted/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CompassIcon className="size-4" /> Planning your next stage?
              </CardTitle>
              <CardDescription>Get a personal cash-flow and growth plan from our advisors, based on your real numbers.</CardDescription>
            </CardHeader>
            <CardContent>
              <GrowthPlanButton />
            </CardContent>
          </Card>
        </div>
      </div>
    </PageBody>
  )
}
