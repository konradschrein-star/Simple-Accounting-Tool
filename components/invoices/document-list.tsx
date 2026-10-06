import { PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { db } from "@/db/client"
import { displayStatus, KIND_LABELS, openAmount, type DisplayStatus, type DocumentKind } from "@/invoicing/documents"
import type { ReadyOrgContext } from "@/server/context"
import { newDocument } from "@/server/actions/invoices"
import { listDocuments } from "@/server/repos/invoices"
import { DocumentsTable, type DocumentRow } from "./documents-table"

export function NewDocumentButton({ kind, label }: { kind: DocumentKind; label?: string }) {
  return (
    <form action={newDocument.bind(null, kind, undefined)}>
      <Button>
        <PlusIcon /> {label ?? `New ${KIND_LABELS[kind].singular.toLowerCase()}`}
      </Button>
    </form>
  )
}

/** Server-side list of one document kind, rendered with the shared data table. */
export function DocumentList({ ctx, kind, status }: { ctx: ReadyOrgContext; kind: DocumentKind; status?: string }) {
  const rows: DocumentRow[] = listDocuments(db, ctx.orgId, kind).map(({ invoice, clientName, paidMinor }) => ({
    id: invoice.id,
    number: invoice.number,
    clientName: clientName ?? "",
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    status: displayStatus(invoice, ctx.today, paidMinor),
    totalMinor: invoice.totalMinor,
    openMinor: openAmount(invoice.totalMinor, paidMinor),
    currency: invoice.currency,
    recurring: !!invoice.recurringSeriesId,
  }))
  return (
    <DocumentsTable
      status={rows.some((r) => r.status === status) ? (status as DisplayStatus) : undefined}
      rows={rows}
      locale={ctx.settings.locale}
      dueLabel={kind === "quote" ? "Valid until" : "Due"}
      empty={kind === "credit_note" ? "Credit notes appear here when you cancel or correct an invoice." : `No ${KIND_LABELS[kind].plural.toLowerCase()} yet.`}
    />
  )
}
