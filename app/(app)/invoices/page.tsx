import { FileTextIcon, PlusIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { PageBody, PageHeader } from "@/components/shell/page-header"
import { InvoiceStatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { db } from "@/db/client"
import { displayStatus, type DisplayStatus } from "@/invoicing/rules"
import { formatDate, monthKey } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import { cn } from "@/lib/utils"
import { requireReadyOrg } from "@/server/context"
import { listInvoices } from "@/server/repos/invoices"
import { newInvoice } from "@/server/actions/invoices"

export const metadata: Metadata = { title: "Invoices" }

const FILTERS: { key: "all" | DisplayStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Drafts" },
  { key: "open", label: "Open" },
  { key: "overdue", label: "Overdue" },
  { key: "paid", label: "Paid" },
]

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const ctx = await requireReadyOrg()
  const { status = "all" } = await searchParams
  const { currency, locale } = ctx.settings
  const money = (minor: number) => formatMoney(minor, currency, locale)
  const rows = listInvoices(db, ctx.orgId).map((r) => ({ ...r, display: displayStatus(r.invoice, ctx.today) }))
  const sum = (filter: (r: (typeof rows)[number]) => boolean) => rows.filter(filter).reduce((s, r) => s + r.invoice.totalMinor, 0)
  const stats = [
    { label: "Outstanding", value: sum((r) => r.display === "open" || r.display === "overdue"), hint: "Finalized, not yet paid" },
    { label: "Overdue", value: sum((r) => r.display === "overdue"), hint: "Past due date", tone: "text-destructive" },
    { label: "Paid this month", value: sum((r) => r.display === "paid" && monthKey(r.invoice.paidDate ?? "") === monthKey(ctx.today)), hint: "By payment date", tone: "text-success" },
  ]
  const visible = status === "all" ? rows : rows.filter((r) => r.display === status)
  const create = (
    <form action={newInvoice.bind(null, undefined)}>
      <Button>
        <PlusIcon /> New invoice
      </Button>
    </form>
  )

  return (
    <PageBody>
      <PageHeader title="Invoices" description="Create, finalize and track payment." actions={create} />
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader>
              <CardDescription>{s.label}</CardDescription>
              <CardTitle className={cn("text-2xl tabular-nums", s.tone)}>{money(s.value)}</CardTitle>
              <CardDescription className="text-xs">{s.hint}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <Button key={f.key} asChild size="sm" variant={status === f.key ? "secondary" : "ghost"}>
            <Link href={f.key === "all" ? "/invoices" : `/invoices?status=${f.key}`}>
              {f.label}
              <span className="text-muted-foreground tabular-nums">{f.key === "all" ? rows.length : rows.filter((r) => r.display === f.key).length}</span>
            </Link>
          </Button>
        ))}
      </div>
      {rows.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileTextIcon />
            </EmptyMedia>
            <EmptyTitle>Your first invoice is 60 seconds away</EmptyTitle>
            <EmptyDescription>Compliant layouts for {ctx.jurisdiction.name}, live PDF preview, and payment tracking.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>{create}</EmptyContent>
        </Empty>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Client</TableHead>
                <TableHead className="hidden md:table-cell">Issued</TableHead>
                <TableHead className="hidden md:table-cell">Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map(({ invoice, clientName, display }) => (
                <TableRow key={invoice.id} className="relative">
                  <TableCell className="font-medium">
                    <Link href={`/invoices/${invoice.id}`} className="after:absolute after:inset-0">
                      {invoice.number ?? <span className="text-muted-foreground italic">Draft</span>}
                    </Link>
                  </TableCell>
                  <TableCell>{clientName ?? "—"}</TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{formatDate(invoice.issueDate, locale)}</TableCell>
                  <TableCell className={cn("hidden md:table-cell", display === "overdue" ? "text-destructive" : "text-muted-foreground")}>
                    {formatDate(invoice.dueDate, locale)}
                  </TableCell>
                  <TableCell>
                    <InvoiceStatusBadge status={display} />
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{money(invoice.totalMinor)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </PageBody>
  )
}
