import { PencilIcon, PlusIcon, UsersIcon } from "lucide-react"
import type { Metadata } from "next"
import { ClientDialog } from "@/components/clients/client-dialog"
import { PageBody, PageHeader } from "@/components/shell/page-header"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { db } from "@/db/client"
import { requireReadyOrg } from "@/server/context"
import { listClients } from "@/server/repos/clients"
import { newDocument } from "@/server/actions/invoices"

export const metadata: Metadata = { title: "Clients" }

export default async function ClientsPage() {
  const ctx = await requireReadyOrg()
  const rows = listClients(db, ctx.orgId)
  const addButton = (
    <Button>
      <PlusIcon /> New client
    </Button>
  )
  return (
    <PageBody>
      <PageHeader title="Clients" description="Who you invoice." actions={<ClientDialog trigger={addButton} />} />
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
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Email</TableHead>
                <TableHead className="hidden md:table-cell">City</TableHead>
                <TableHead className="text-right">Invoices</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ client, invoiceCount }) => (
                <TableRow key={client.id}>
                  <TableCell className="font-medium">{client.name}</TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{client.email || "—"}</TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{client.city || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{invoiceCount}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <form action={newDocument.bind(null, "invoice", client.id)}>
                        <Button size="sm" variant="ghost">
                          Invoice
                        </Button>
                      </form>
                      <ClientDialog
                        client={client}
                        trigger={
                          <Button size="icon" variant="ghost" aria-label={`Edit ${client.name}`}>
                            <PencilIcon />
                          </Button>
                        }
                      />
                    </div>
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
