import { BriefcaseBusinessIcon, LogInIcon } from "lucide-react"
import type { Metadata } from "next"
import { PageBody, PageHeader } from "@/components/shell/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { priorMonth } from "@/lib/dates"
import { db } from "@/db/client"
import { requireStaff } from "@/server/context"
import { enterClientWorkspace } from "@/server/actions/console"
import { consoleSignals } from "@/server/repos/admin"
import { listEngagements } from "@/server/repos/engagements"

export const metadata: Metadata = { title: "Bookkeeper console" }

export default async function ConsolePage() {
  const { user } = await requireStaff()
  const engagements = listEngagements(db, { staffUserId: user.role === "admin" ? undefined : user.id, statuses: ["active"] })
  const currentMonth = new Date().toISOString().slice(0, 7)
  const lastMonth = priorMonth(currentMonth)
  const signals = consoleSignals(db, engagements.map((e) => e.engagement.orgId), currentMonth, lastMonth)
  const rows = engagements
    .map((e) => ({ ...e, s: signals.get(e.engagement.orgId)! }))
    .map((r) => ({ ...r, work: r.s.needsReview + r.s.failedRecon * 10 + (r.s.lastMonthClosed ? 0 : 5) }))
    .sort((a, b) => b.work - a.work)

  return (
    <PageBody>
      <PageHeader
        title="Bookkeeper console"
        description={`${rows.length} active client${rows.length === 1 ? "" : "s"}${user.role === "admin" ? " (all staff)" : " assigned to you"}. Sorted by work needed.`}
      />
      {rows.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BriefcaseBusinessIcon />
            </EmptyMedia>
            <EmptyTitle>No active clients</EmptyTitle>
            <EmptyDescription>Engagements appear here once an admin activates them and assigns them to you.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Client</TableHead>
                <TableHead className="text-right">To review</TableHead>
                <TableHead>Last import</TableHead>
                <TableHead>Reconciliation</TableHead>
                <TableHead>Last close</TableHead>
                <TableHead className="pr-6" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ engagement, orgName, staffName, s }) => (
                <TableRow key={engagement.id}>
                  <TableCell className="pl-6">
                    <div className="font-medium">{orgName}</div>
                    <div className="text-xs text-muted-foreground">
                      {engagement.planLabel || "Bookkeeping"}
                      {staffName ? ` · ${staffName}` : ""}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {s.needsReview ? <Badge variant="outline" className="border-warning/60">{s.needsReview}</Badge> : <span className="text-muted-foreground">0</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{s.lastImport ? s.lastImport.toLocaleDateString("en-GB") : "never"}</TableCell>
                  <TableCell>{s.failedRecon ? <Badge variant="destructive">{s.failedRecon} failed</Badge> : <span className="text-success">OK</span>}</TableCell>
                  <TableCell>{s.lastMonthClosed ? <span className="text-success">{s.lastClose}</span> : <Badge variant="outline">{lastMonth} open</Badge>}</TableCell>
                  <TableCell className="pr-6 text-right">
                    <form action={enterClientWorkspace.bind(null, engagement.orgId)}>
                      <Button size="sm">
                        <LogInIcon /> Open books
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </PageBody>
  )
}
