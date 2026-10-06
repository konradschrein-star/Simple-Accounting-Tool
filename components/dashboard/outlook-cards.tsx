import { ArrowRightIcon, LandmarkIcon, TelescopeIcon, WalletIcon } from "lucide-react"
import Link from "next/link"
import type { CashOutlook } from "@/advisory/cash-outlook"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDate } from "@/lib/dates"
import { formatMoney, type CurrencyCode } from "@/lib/money"
import { cn } from "@/lib/utils"

type Fmt = { currency: CurrencyCode; locale: string }

function Row({ label, value, tone, strong }: { label: string; value: string; tone?: string; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-4 text-sm", strong && "border-t pt-2 font-medium")}>
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("tabular-nums", tone)}>{value}</span>
    </div>
  )
}

export function CashPositionCard({ outlook, currency, locale }: { outlook: CashOutlook } & Fmt) {
  const money = (m: number) => formatMoney(m, currency, locale)
  const burning = outlook.netBurnMinor > 0
  return (
    <Card>
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          <LandmarkIcon className="size-4" /> Cash position
        </CardDescription>
        {outlook.balanceMinor !== null ? (
          <>
            <CardTitle className="text-3xl tabular-nums">{money(outlook.balanceMinor)}</CardTitle>
            <CardDescription className="text-xs">Bank balance from {formatDate(outlook.balanceAsOf!, locale)}, plus everything booked since</CardDescription>
          </>
        ) : (
          <>
            <CardTitle className="text-base">Add your bank balance</CardTitle>
            <CardDescription className="text-xs">Import a statement with balances, or enter it in Settings, to see your runway.</CardDescription>
          </>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        <Row label="Avg. cash in / month" value={money(outlook.avgCashInMinor)} />
        <Row label="Avg. expenses / month" value={money(outlook.avgExpensesMinor)} />
        <Row
          label={burning ? "Net burn / month" : "Net surplus / month"}
          value={money(Math.abs(outlook.netBurnMinor))}
          tone={burning ? "text-destructive" : "text-success"}
          strong
        />
        <Row
          label="Runway"
          value={
            !burning
              ? "Self-funding"
              : outlook.runwayMonths === null
                ? "—"
                : `${outlook.runwayMonths.toLocaleString(locale, { maximumFractionDigits: 1 })} months`
          }
          tone={burning && outlook.runwayMonths !== null && outlook.runwayMonths < 6 ? "font-semibold text-destructive" : undefined}
        />
        {outlook.balanceMinor === null ? (
          <Button asChild variant="link" className="h-auto px-0">
            <Link href="/settings#bank-balance">
              Set balance <ArrowRightIcon />
            </Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function Next30DaysCard({ outlook, currency, locale }: { outlook: CashOutlook } & Fmt) {
  const money = (m: number) => formatMoney(m, currency, locale)
  const n = outlook.next30
  return (
    <Card>
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          <TelescopeIcon className="size-4" /> Next 30 days
        </CardDescription>
        <CardTitle className={cn("text-3xl tabular-nums", n.netMinor >= 0 ? "text-success" : "text-destructive")}>
          {n.netMinor >= 0 ? "+" : "−"}
          {money(Math.abs(n.netMinor))}
        </CardTitle>
        <CardDescription className="text-xs">Expected change in cash</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Row label="Invoices falling due" value={money(n.receivablesMinor)} tone="text-success" />
        <Row label="Typical expenses" value={`−${money(n.expensesMinor)}`} />
        {n.scheduledMinor ? <Row label="Recurring invoices to send" value={money(n.scheduledMinor)} /> : null}
        {n.endBalanceMinor !== null ? <Row label="Projected balance" value={money(n.endBalanceMinor)} strong /> : null}
      </CardContent>
    </Card>
  )
}

export function SpendingCard({ rows, currency, locale, periodLabel }: { rows: { name: string; amountMinor: number }[]; periodLabel: string } & Fmt) {
  const money = (m: number) => formatMoney(m, currency, locale)
  const total = rows.reduce((s, r) => s + r.amountMinor, 0)
  const max = Math.max(1, ...rows.map((r) => r.amountMinor))
  return (
    <Card>
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          <WalletIcon className="size-4" /> Where the money goes
        </CardDescription>
        <CardTitle className="text-3xl tabular-nums">{money(total)}</CardTitle>
        <CardDescription className="text-xs">Expenses · {periodLabel}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length ? (
          <ul className="space-y-2.5" aria-label="Expenses by category">
            {rows.map((r) => (
              <li key={r.name} className="space-y-1">
                <div className="flex justify-between gap-3 text-sm">
                  <span className="truncate">{r.name}</span>
                  <span className="shrink-0 text-muted-foreground tabular-nums">
                    {money(r.amountMinor)} · {Math.round((r.amountMinor / total) * 100)} %
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted">
                  <div className="h-full rounded-full bg-chart-2" style={{ width: `${Math.max(2, (r.amountMinor / max) * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No expenses booked in this period.</p>
        )}
      </CardContent>
    </Card>
  )
}
