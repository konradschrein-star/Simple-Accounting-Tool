import { CalendarClockIcon, InfoIcon } from "lucide-react"
import { FilterLinks } from "@/components/shell/page-tabs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { db } from "@/db/client"
import { addDays, formatDate } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import { cn } from "@/lib/utils"
import type { ReadyOrgContext } from "@/server/context"
import { vatSummary } from "@/server/repos/vat"
import { taxProfileOf } from "@/server/repos/workspace"
import { returnLines, vatPeriods } from "@/tax/vat-return"

const RETURN_NAME = { de: "Umsatzsteuer-Voranmeldung", uk: "VAT return", je: "GST return", us: "Sales tax summary" } as const

export function vatTabLabel(code: keyof typeof RETURN_NAME) {
  return code === "de" ? "USt-Voranmeldung" : code === "us" ? "Sales tax" : RETURN_NAME[code]
}

export function VatTab({ ctx, period: periodKey }: { ctx: ReadyOrgContext; period?: string }) {
  const { settings, jurisdiction } = ctx
  const money = (minor: number | null) => (minor === null ? "" : formatMoney(minor, settings.currency, settings.locale))
  if (jurisdiction.code !== "us" && (!settings.taxRegistered || settings.smallBusinessExempt)) {
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
  // US: sales tax is filed per state on its own calendar; quarters are the common case.
  const frequency = jurisdiction.code === "us" || settings.vatFilingFrequency === "none" ? "quarterly" : settings.vatFilingFrequency
  const periods = vatPeriods(frequency, jurisdiction.code === "de" || jurisdiction.code === "us" ? 3 : settings.vatPeriodEndMonth, ctx.today, 6)
  const period = periods.find((p) => p.key === periodKey) ?? periods[Math.min(1, periods.length - 1)]
  const summary = vatSummary(db, ctx.orgId, jurisdiction, settings, period)
  const lines = returnLines(jurisdiction.code, summary)
  const deadline = jurisdiction.taxDeadlines(taxProfileOf(settings), addDays(period.to, 1), addDays(period.to, 75)).find((d) => /vat|ust|gst/i.test(d.id))
  const open = period.to >= ctx.today
  const stats = [
    {
      label: jurisdiction.code === "us" ? "Sales tax collected" : "Output tax",
      value: summary.outputTaxMinor,
      hint: `${summary.documentCount} document${summary.documentCount === 1 ? "" : "s"}`,
    },
    ...(jurisdiction.code === "us"
      ? []
      : [
          { label: "Input tax", value: summary.inputTaxMinor, hint: `${summary.purchaseCount} expense${summary.purchaseCount === 1 ? "" : "s"} from the bank` },
        ]),
    {
      label: summary.netTaxMinor >= 0 ? "To pay" : "Refund due",
      value: Math.abs(summary.netTaxMinor),
      hint: deadline ? `Due ${formatDate(deadline.date, settings.locale)}` : open ? "Period still running" : "",
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
              <CardTitle className={cn("text-2xl tabular-nums", s.tone)}>{money(s.value)}</CardTitle>
              <CardDescription className="flex items-center gap-1 text-xs">
                {s.hint && s.hint.startsWith("Due") ? <CalendarClockIcon className="size-3" /> : null}
                {s.hint}
              </CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
      <Card className="py-0">
        <CardHeader className="pt-6">
          <CardTitle className="text-base">
            {RETURN_NAME[jurisdiction.code]} · {period.label}
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
                <TableHead className="w-20 pl-6">{jurisdiction.code === "de" ? "Kz." : jurisdiction.code === "uk" ? "Box" : ""}</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">{jurisdiction.code === "de" ? "Bemessungsgrundlage" : "Value"}</TableHead>
                <TableHead className="pr-6 text-right">{jurisdiction.taxLabel}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => (
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
        {jurisdiction.code === "us" ? "" : `; input tax uses each expense account's usual ${jurisdiction.taxLabel} rate unless a receipt says otherwise`}. Check
        the figures before you file
        {jurisdiction.code === "de" ? " via ELSTER" : jurisdiction.code === "uk" ? " through MTD-compatible software" : ""} — or let our bookkeepers file it for
        you.
      </p>
    </>
  )
}
