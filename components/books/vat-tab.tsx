import { CalendarClockIcon, InfoIcon } from "lucide-react"
import { FilterLinks } from "@/components/shell/page-tabs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { db } from "@/db/client"
import { reclaimsInputTax } from "@/jurisdictions/tax-profile"
import { addDays, formatDate } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import { cn } from "@/lib/utils"
import type { ReadyOrgContext } from "@/server/context"
import { vatSummary } from "@/server/repos/vat"
import { taxProfileOf } from "@/server/repos/workspace"
import { vatPeriods } from "@/tax/vat-return"

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

export function VatTab({ ctx, period: periodKey }: { ctx: ReadyOrgContext; period?: string }) {
  const { settings, jurisdiction } = ctx
  const form = jurisdiction.vatReturn
  const money = (minor: number | null) => (minor === null ? "" : formatMoney(minor, settings.currency, settings.locale))
  if (form.requiresRegistration && !reclaimsInputTax(jurisdiction, settings)) {
    return (
      <Alert>
        <InfoIcon />
        <AlertTitle>No {jurisdiction.taxLabel} return needed</AlertTitle>
        <AlertDescription>
          {settings.smallBusinessExempt
            ? "As a Kleinunternehmer (§19 UStG) you don't charge USt and don't file Voranmeldungen — keep an eye on the turnover limits (€25k prior year / €100k current year)."
            : `Your workspace isn't ${jurisdiction.taxLabel}-registered. Turn on registration in Settings once you are, and returns appear here.`}
        </AlertDescription>
      </Alert>
    )
  }
  const frequency = form.frequency ?? (settings.vatFilingFrequency === "none" ? "quarterly" : settings.vatFilingFrequency)
  const periods = vatPeriods(frequency, form.calendarQuarters ? 3 : settings.vatPeriodEndMonth, ctx.today, 6)
  const period = periods.find((p) => p.key === periodKey) ?? periods[Math.min(1, periods.length - 1)]
  const summary = vatSummary(db, ctx.orgId, jurisdiction, settings, period)
  const deadline = jurisdiction
    .taxDeadlines(taxProfileOf(settings), addDays(period.to, 1), addDays(period.to, 75))
    .find((d) => d.id.startsWith(form.deadlineIdPrefix))
  const open = period.to >= ctx.today
  const stats = [
    { label: `${jurisdiction.taxLabel} charged`, value: summary.outputTaxMinor, hint: plural(summary.documentCount, "document") },
    ...(form.showsInputTax ? [{ label: "Input tax", value: summary.inputTaxMinor, hint: `${plural(summary.purchaseCount, "expense")} from the bank` }] : []),
    {
      label: summary.netTaxMinor >= 0 ? "To pay" : "Refund due",
      value: Math.abs(summary.netTaxMinor),
      hint: deadline ? `Due ${formatDate(deadline.date, settings.locale)}` : open ? "Period still running" : "",
      due: !!deadline,
      tone: summary.netTaxMinor >= 0 ? "" : "text-success",
    },
  ]

  return (
    <>
      <FilterLinks current={period.key} items={[...periods].reverse().map((p) => ({ key: p.key, href: `/books?tab=vat&p=${p.key}`, label: p.label }))} />
      <div className={cn("grid gap-4", stats.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader>
              <CardDescription>{s.label}</CardDescription>
              <CardTitle className={cn("text-2xl tabular-nums", "tone" in s && s.tone)}>{money(s.value)}</CardTitle>
              <CardDescription className="flex items-center gap-1 text-xs">
                {"due" in s && s.due ? <CalendarClockIcon className="size-3" /> : null}
                {s.hint}
              </CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
      <Card className="py-0">
        <CardHeader className="pt-6">
          <CardTitle className="text-base">
            {form.name} · {period.label}
          </CardTitle>
          <CardDescription>
            {formatDate(period.from, settings.locale)} – {formatDate(period.to, settings.locale)} ·{" "}
            {settings.vatAccounting === "cash" ? "cash accounting (tax follows payments)" : "standard accounting (tax follows invoice dates)"}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20 pl-6">{form.boxHeader}</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">{form.baseHeader}</TableHead>
                <TableHead className="pr-6 text-right">{jurisdiction.taxLabel}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {form.lines(summary).map((line) => (
                <TableRow key={line.key} className={cn(line.total && "bg-muted/50 font-semibold")}>
                  <TableCell className="pl-6 font-mono text-muted-foreground">{line.box}</TableCell>
                  <TableCell>{line.label}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(line.baseMinor)}</TableCell>
                  <TableCell className="pr-6 text-right tabular-nums">{money(line.taxMinor)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Prepared from your issued invoices and the expenses booked from your bank
        {form.showsInputTax ? `; input tax uses each expense account's usual ${jurisdiction.taxLabel} rate unless a receipt says otherwise` : ""}. Check the
        figures before you file{form.filingHint} — or let our bookkeepers file it for you.
      </p>
    </>
  )
}
