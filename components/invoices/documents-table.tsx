"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { RepeatIcon } from "lucide-react"
import Link from "next/link"
import { DataTable, facetFilterFn, SortHeader, type Facet } from "@/components/data-table/data-table"
import { InvoiceStatusBadge } from "@/components/status-badge"
import type { DisplayStatus } from "@/invoicing/documents"
import { formatDate } from "@/lib/dates"
import { formatMoney, type CurrencyCode } from "@/lib/money"
import { cn } from "@/lib/utils"

export type DocumentRow = {
  id: string
  number: string | null
  clientName: string
  issueDate: string
  dueDate: string
  status: DisplayStatus
  totalMinor: number
  openMinor: number
  currency: CurrencyCode
  recurring: boolean
}

const STATUS_LABELS: Partial<Record<DisplayStatus, string>> = {
  draft: "Draft",
  open: "Open",
  partial: "Part-paid",
  overdue: "Overdue",
  paid: "Paid",
  cancelled: "Cancelled",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
  converted: "Invoiced",
  expired: "Expired",
  issued: "Issued",
}

export function DocumentsTable({ rows, locale, dueLabel, toolbar, empty }: { rows: DocumentRow[]; locale: string; dueLabel: string; toolbar?: React.ReactNode; empty?: React.ReactNode }) {
  const statuses = [...new Set(rows.map((r) => r.status))]
  const facets: Facet[] = [{ columnId: "status", title: "Status", options: statuses.map((s) => ({ value: s, label: STATUS_LABELS[s] ?? s })) }]
  const columns: ColumnDef<DocumentRow>[] = [
    {
      accessorKey: "number",
      header: ({ column }) => <SortHeader column={column} title="Number" />,
      cell: ({ row }) => (
        <span className="flex items-center gap-1.5 font-medium">
          <Link href={`/invoices/${row.original.id}`} className="hover:underline">
            {row.original.number ?? <span className="text-muted-foreground italic">Draft</span>}
          </Link>
          {row.original.recurring ? <RepeatIcon className="size-3.5 text-muted-foreground" aria-label="Recurring" /> : null}
        </span>
      ),
    },
    { accessorKey: "clientName", header: ({ column }) => <SortHeader column={column} title="Client" />, cell: ({ row }) => row.original.clientName || "—" },
    {
      accessorKey: "issueDate",
      header: ({ column }) => <SortHeader column={column} title="Issued" className="hidden md:inline-flex" />,
      cell: ({ row }) => <span className="hidden text-muted-foreground md:inline">{formatDate(row.original.issueDate, locale)}</span>,
    },
    {
      accessorKey: "dueDate",
      header: ({ column }) => <SortHeader column={column} title={dueLabel} className="hidden md:inline-flex" />,
      cell: ({ row }) => (
        <span className={cn("hidden md:inline", row.original.status === "overdue" ? "text-destructive" : "text-muted-foreground")}>{formatDate(row.original.dueDate, locale)}</span>
      ),
    },
    { accessorKey: "status", header: "Status", filterFn: facetFilterFn, cell: ({ row }) => <InvoiceStatusBadge status={row.original.status} /> },
    {
      accessorKey: "totalMinor",
      header: ({ column }) => <SortHeader column={column} title="Total" className="ml-auto" />,
      cell: ({ row }) => (
        <div className="text-right">
          <div className="font-medium tabular-nums">{formatMoney(row.original.totalMinor, row.original.currency, locale)}</div>
          {row.original.status === "partial" ? <div className="text-xs text-muted-foreground tabular-nums">{formatMoney(row.original.openMinor, row.original.currency, locale)} open</div> : null}
        </div>
      ),
    },
  ]
  return (
    <DataTable
      columns={columns}
      data={rows}
      facets={facets}
      rowHref={(r) => `/invoices/${r.id}`}
      searchPlaceholder="Search number or client…"
      initialSorting={[{ id: "issueDate", desc: true }]}
      toolbar={toolbar}
      empty={empty}
    />
  )
}
