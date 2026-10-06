import { DownloadIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { InlineSelect } from "@/components/admin/inline-select"
import { PageBody, PageHeader } from "@/components/shell/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { db } from "@/db/client"
import { formatMoney, type CurrencyCode } from "@/lib/money"
import { cn } from "@/lib/utils"
import { requireAdmin } from "@/server/context"
import { assignEngagementStaff, setEngagementStatus, updateRequestStatus, updateUserRole } from "@/server/actions/admin"
import { leadRows, listUsers, platformTotals } from "@/server/repos/admin"
import { listEngagements } from "@/server/repos/engagements"

export const metadata: Metadata = { title: "Admin & leads" }

const REQUEST_STATUSES = ["new", "contacted", "booked", "closed"].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))
const ENGAGEMENT_STATUSES = ["requested", "active", "paused", "ended"].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))
const ROLES = ["user", "staff", "admin"].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))
const TABS = [
  ["leads", "Leads"],
  ["engagements", "Bookkeeping engagements"],
  ["users", "Team & users"],
] as const

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { user: me } = await requireAdmin()
  const tab = (await searchParams).tab ?? "leads"
  const totals = platformTotals(db)
  const users = listUsers(db)
  const staff = users.filter((u) => u.role === "staff" || u.role === "admin")

  let body: React.ReactNode
  if (tab === "engagements") {
    const engagements = listEngagements(db)
    body = (
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">Client</TableHead>
              <TableHead>Requested</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="pr-6">Bookkeeper</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {engagements.map(({ engagement: e, orgName }) => (
              <TableRow key={e.id}>
                <TableCell className="pl-6 font-medium">{orgName}</TableCell>
                <TableCell className="text-muted-foreground">{e.createdAt.toLocaleDateString("en-GB")} · consent ✓</TableCell>
                <TableCell>
                  <InlineSelect value={e.status} options={ENGAGEMENT_STATUSES} action={setEngagementStatus.bind(null, e.id)} />
                </TableCell>
                <TableCell className="pr-6">
                  <InlineSelect
                    value={e.assignedStaffUserId}
                    placeholder="Assign…"
                    className="h-8 w-48"
                    options={staff.map((s) => ({ value: s.id, label: s.name || s.email }))}
                    action={assignEngagementStaff.bind(null, e.id)}
                  />
                </TableCell>
              </TableRow>
            ))}
            {engagements.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  No bookkeeping requests yet.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </Card>
    )
  } else if (tab === "users") {
    body = (
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">User</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="pr-6">Role</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users
              .filter((u) => !u.isAnonymous)
              .map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="pl-6">
                    <div className="font-medium">{u.name}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{u.createdAt.toLocaleDateString("en-GB")}</TableCell>
                  <TableCell className="pr-6">
                    {u.id === me.id ? <Badge>admin (you)</Badge> : <InlineSelect value={u.role ?? "user"} options={ROLES} action={updateUserRole.bind(null, u.id)} />}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Card>
    )
  } else {
    const leads = leadRows(db)
    body = (
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">Workspace</TableHead>
              <TableHead className="text-right">Lifetime invoiced</TableHead>
              <TableHead className="text-right">12m cash in</TableHead>
              <TableHead className="text-right">12m margin</TableHead>
              <TableHead>Signals</TableHead>
              <TableHead className="pr-6">Request</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.map((l) => {
              const money = (m: number) => formatMoney(m, l.currency as CurrencyCode, "en-GB")
              return (
                <TableRow key={l.orgId}>
                  <TableCell className="pl-6">
                    <div className="font-medium">
                      {l.orgName} {l.isDemo ? <Badge variant="outline">demo</Badge> : null}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {l.ownerName} · {l.ownerEmail} · {l.jurisdiction?.toUpperCase()}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{money(l.lifetimeInvoicedMinor)}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(l.trailing12CashInMinor)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", l.trailing12MarginBp !== null && l.trailing12MarginBp < 2500 && "text-destructive")}>
                    {l.trailing12MarginBp === null ? "—" : `${(l.trailing12MarginBp / 100).toFixed(0)} %`}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {l.optedIn ? <Badge variant="secondary">opted in</Badge> : null}
                      {l.activeAlerts ? <Badge variant="outline">{l.activeAlerts} alerts</Badge> : null}
                    </div>
                  </TableCell>
                  <TableCell className="pr-6">
                    {l.request ? (
                      <div className="flex items-center gap-2">
                        <Badge className={l.request.kind === "bookkeeping" ? "bg-chart-2/15 text-chart-2" : "bg-primary/15 text-primary"}>
                          {l.request.kind === "bookkeeping" ? "Bookkeeping" : "Growth plan"}
                        </Badge>
                        <InlineSelect value={l.request.status} options={REQUEST_STATUSES} action={updateRequestStatus.bind(null, l.request.id)} className="h-8 w-32" />
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
            {leads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  No opted-in workspaces or requests yet.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </Card>
    )
  }

  return (
    <PageBody>
      <PageHeader
        title="Admin & leads"
        description="Only workspaces that opted in or requested help are listed. Everyone else appears in totals only."
        actions={
          <Button asChild variant="outline">
            <a href="/api/admin/leads">
              <DownloadIcon /> Export leads CSV
            </a>
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ["Workspaces", totals.workspaces],
          ["Opted in", totals.optedIn],
          ["Requests", totals.requests],
          ["Demo sessions", totals.demos],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardHeader>
              <CardDescription>{label}</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
      <div className="flex gap-1 border-b">
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            href={`/admin?tab=${key}`}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === key ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {label}
          </Link>
        ))}
      </div>
      {body}
    </PageBody>
  )
}

