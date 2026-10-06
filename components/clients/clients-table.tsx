"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { PencilIcon } from "lucide-react"
import { DataTable, SortHeader } from "@/components/data-table/data-table"
import { Button } from "@/components/ui/button"
import { formatMoney, type CurrencyCode } from "@/lib/money"
import { cn } from "@/lib/utils"
import { newDocument } from "@/server/actions/invoices"
import type { Client } from "@/server/repos/clients"
import { ClientDialog } from "./client-dialog"

export type ClientRow = { client: Client; invoiceCount: number; openMinor: number; overdueMinor: number }

export function ClientsTable({ rows, currency, locale, initialSearch }: { rows: ClientRow[]; currency: CurrencyCode; locale: string; initialSearch?: string }) {
  const money = (m: number) => formatMoney(m, currency, locale)
  const columns: ColumnDef<ClientRow>[] = [
    {
      // Name and email in one value, so the search finds either.
      id: "name",
      accessorFn: (r) => `${r.client.name} ${r.client.email}`,
      header: ({ column }) => <SortHeader column={column} title="Client" />,
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{row.original.client.name}</div>
          <div className="truncate text-xs text-muted-foreground">{row.original.client.email || "No email"}</div>
        </div>
      ),
    },
    {
      id: "city",
      accessorFn: (r) => r.client.city,
      header: ({ column }) => <SortHeader column={column} title="City" className="hidden md:inline-flex" />,
      cell: ({ row }) => <span className="hidden text-muted-foreground md:inline">{row.original.client.city || "—"}</span>,
    },
    {
      accessorKey: "invoiceCount",
      header: ({ column }) => <SortHeader column={column} title="Documents" className="ml-auto" />,
      cell: ({ row }) => <div className="text-right tabular-nums">{row.original.invoiceCount}</div>,
    },
    {
      accessorKey: "openMinor",
      header: ({ column }) => <SortHeader column={column} title="Outstanding" className="ml-auto" />,
      cell: ({ row }) => (
        <div className="text-right">
          <div className={cn("tabular-nums", !row.original.openMinor && "text-muted-foreground")}>{money(row.original.openMinor)}</div>
          {row.original.overdueMinor ? <div className="text-xs text-destructive tabular-nums">{money(row.original.overdueMinor)} overdue</div> : null}
        </div>
      ),
    },
    {
      id: "actions",
      header: () => null,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <form action={newDocument.bind(null, "invoice", row.original.client.id)}>
            <Button size="sm" variant="ghost">
              Invoice
            </Button>
          </form>
          <ClientDialog
            client={row.original.client}
            trigger={
              <Button size="icon" variant="ghost" aria-label={`Edit ${row.original.client.name}`}>
                <PencilIcon />
              </Button>
            }
          />
        </div>
      ),
    },
  ]
  return (
    <DataTable columns={columns} data={rows} searchPlaceholder="Search clients…" initialSorting={[{ id: "name", desc: false }]} initialSearch={initialSearch} />
  )
}
