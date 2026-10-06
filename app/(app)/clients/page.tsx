import { PlusIcon, UsersIcon } from "lucide-react"
import type { Metadata } from "next"
import { ClientDialog } from "@/components/clients/client-dialog"
import { ClientsTable } from "@/components/clients/clients-table"
import { PageBody, PageHeader } from "@/components/shell/page-header"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { workspaceMetrics } from "@/advisory/evaluate"
import { receivablesByClient } from "@/advisory/metrics"
import { db } from "@/db/client"
import { requireReadyOrg } from "@/server/context"
import { listClients } from "@/server/repos/clients"

export const metadata: Metadata = { title: "Clients" }

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await requireReadyOrg()
  const { q } = await searchParams
  const rows = listClients(db, ctx.orgId)
  const owed = receivablesByClient(workspaceMetrics(db, ctx.orgId, ctx.today).receivables)
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
          rows={rows.map(({ client, invoiceCount }) => ({ client, invoiceCount, openMinor: 0, overdueMinor: 0, ...owed.get(client.id) }))}
        />
      )}
    </PageBody>
  )
}
