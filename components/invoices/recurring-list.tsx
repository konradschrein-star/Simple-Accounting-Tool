import { RepeatIcon } from "lucide-react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { db } from "@/db/client"
import { formatDate } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import type { ReadyOrgContext } from "@/server/context"
import { listSeries, type RecurringSeries } from "@/server/repos/recurring"
import { SeriesToggle } from "./series-toggle"

const STATE_LABEL: Record<RecurringSeries["state"], string> = {
  active: "Active",
  paused: "Paused",
  failed: "Stopped — open the template to fix it",
  completed: "Completed",
}
const EVERY: Record<string, string> = { weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly", yearly: "Yearly" }

export function RecurringList({ ctx }: { ctx: ReadyOrgContext }) {
  const series = listSeries(db, ctx.orgId)
  if (!series.length)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <RepeatIcon />
          </EmptyMedia>
          <EmptyTitle>No recurring invoices yet</EmptyTitle>
          <EmptyDescription>Open any invoice and choose “Make recurring” — retainers then bill themselves.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  return (
    <Card className="py-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-6">Client</TableHead>
            <TableHead>Schedule</TableHead>
            <TableHead>Next invoice</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="pr-6 text-right">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {series.map(({ series: s, template, clientName }) => (
            <TableRow key={s.id}>
              <TableCell className="pl-6 font-medium">
                <Link href={`/invoices/${template.id}`} className="hover:underline">
                  {clientName ?? "—"}
                </Link>
              </TableCell>
              <TableCell>
                {EVERY[s.frequency]}
                {s.totalCount !== null ? <span className="text-muted-foreground"> · {Math.max(0, s.totalCount - s.generatedCount)} left</span> : null}
                {s.autoSend ? (
                  <Badge variant="outline" className="ml-2">
                    auto-send
                  </Badge>
                ) : null}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {s.state === "active" ? formatDate(s.nextIssueDate, ctx.settings.locale) : <span title={s.lastError ?? undefined}>{STATE_LABEL[s.state]}</span>}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(template.totalMinor, template.currency, ctx.settings.locale)}</TableCell>
              <TableCell className="pr-6 text-right">
                {s.state === "completed" ? null : <SeriesToggle seriesId={s.id} running={s.state === "active"} />}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}
