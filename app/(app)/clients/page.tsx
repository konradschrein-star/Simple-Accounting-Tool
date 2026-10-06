import { PlusIcon, UsersIcon } from "lucide-react"
import type { Metadata } from "next"
import { ClientDialog } from "@/components/clients/client-dialog"
import { ClientsTable } from "@/components/clients/clients-table"
import { PageBody, PageHeader } from "@/components/shell/page-header"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { db } from "@/db/client"
import { displayStatus, openAmount } from "@/invoicing/documents"
import { toBaseMinor } from "@/lib/money"
import { requireReadyOrg } from "@/server/context"
import { listClients } from "@/server/repos/clients"
import { listDocuments } from "@/server/repos/invoices"

export const metadata: Metadata = { title: "Clients" }

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await requireReadyOrg()
  const { q } = await searchParams
  const rows = listClients(db, ctx.orgId)
  // What each client still owes (in the workspace currency), and how much of it is late.
  const owed = new Map<string, { open: number; overdue: number }>()
  for (const { invoice, paidMinor } of listDocuments(db, ctx.orgId, "invoice")) {
    if (!invoice.clientId || invoice.status !== "finalized") continue
    const open = toBaseMinor(openAmount(invoice.totalMinor, paidMinor), invoice.fxRateMicro)
    const entry = owed.get(invoice.clientId) ?? { open: 0, overdue: 0 }
    entry.open += open
    if (displayStatus(invoice, ctx.today, paidMinor) === "overdue") entry.overdue += open
    owed.set(invoice.clientId, entry)
  }
  const addButton = (
    <Button>
      <PlusIcon /> New client
    </Button>
  )
  return (
    <PageBody>
      <PageHeader title="Clients" description="Who you invoice — and who still owes you." actions={<ClientDialog trigger={addButton} />} />
      {rows.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersIcon />
            </EmptyMedia>
            <EmptyTitle>No clients yet</EmptyTitle>
            <EmptyDescription>Add your first client to start invoicing.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <ClientDialog trigger={addButton} />
          </EmptyContent>
        </Empty>
      ) : (
        <ClientsTable
          currency={ctx.settings.currency}
          locale={ctx.settings.locale}
          initialSearch={q}
          rows={rows.map(({ client, invoiceCount }) => ({
            client,
            name: client.name,
            email: client.email,
            city: client.city,
            invoiceCount,
            openMinor: owed.get(client.id)?.open ?? 0,
            overdueMinor: owed.get(client.id)?.overdue ?? 0,
          }))}
        />
      )}
    </PageBody>
  )
}
