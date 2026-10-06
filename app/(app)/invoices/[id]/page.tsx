import { ArrowLeftIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { InvoiceActions } from "@/components/invoices/invoice-actions"
import { InvoiceEditor } from "@/components/invoices/invoice-editor"
import { PageBody, PageHeader } from "@/components/shell/page-header"
import { InvoiceStatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/db/client"
import { displayStatus } from "@/invoicing/rules"
import { formatDate } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import { requireReadyOrg } from "@/server/context"
import { listClients } from "@/server/repos/clients"
import { previewContext } from "@/server/repos/invoices"
import { taxProfileOf } from "@/server/repos/workspace"

export const metadata: Metadata = { title: "Invoice" }

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireReadyOrg()
  const found = previewContext(db, ctx.orgId, ctx.jurisdiction, id)
  if (!found) notFound()
  const { invoice, items, client, blockers } = found
  const status = displayStatus(invoice, ctx.today)
  const back = (
    <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
      <Link href="/invoices">
        <ArrowLeftIcon /> Invoices
      </Link>
    </Button>
  )

  if (invoice.status === "draft") {
    return (
      <PageBody className="max-w-[1600px]">
        {back}
        <PageHeader title="New invoice" description="Changes save automatically. The preview on the right is the exact PDF your client receives." />
        <InvoiceEditor
          invoiceId={invoice.id}
          initial={{
            clientId: invoice.clientId ?? "",
            issueDate: invoice.issueDate,
            serviceDate: invoice.serviceDate ?? "",
            dueDate: invoice.dueDate,
            notes: invoice.notes,
            paymentTerms: /^\d+$/.test(invoice.paymentTerms) ? "" : invoice.paymentTerms,
            stripePaymentLink: invoice.stripePaymentLink,
            lines: items,
          }}
          clients={listClients(db, ctx.orgId).map(({ client: c }) => ({ id: c.id, name: c.name }))}
          taxRatesBp={ctx.settings.smallBusinessExempt || !ctx.settings.taxRegistered ? [0] : ctx.jurisdiction.taxRatesBp}
          taxLabel={ctx.jurisdiction.taxLabel}
          currency={ctx.settings.currency}
          locale={ctx.settings.locale}
          serviceDateLabel={ctx.jurisdiction.code === "de" ? "Leistungsdatum" : "Date of supply"}
          blockers={blockers}
          exemptionNote={ctx.jurisdiction.exemptionNote(taxProfileOf(ctx.settings))}
        />
      </PageBody>
    )
  }

  const money = (minor: number) => formatMoney(minor, invoice.currency, ctx.settings.locale)
  const facts = [
    ["Client", client?.name ?? "—"],
    ["Issued", formatDate(invoice.issueDate, ctx.settings.locale)],
    ["Due", formatDate(invoice.dueDate, ctx.settings.locale)],
    ["Paid", invoice.paidDate ? formatDate(invoice.paidDate, ctx.settings.locale) : "—"],
    ["Net", money(invoice.subtotalMinor)],
    [ctx.jurisdiction.taxLabel, money(invoice.taxMinor)],
  ]
  return (
    <PageBody>
      {back}
      <PageHeader
        title={invoice.number ?? "Invoice"}
        description={
          <span className="flex items-center gap-2">
            <InvoiceStatusBadge status={status} /> {money(invoice.totalMinor)} {client ? `· ${client.name}` : ""}
          </span>
        }
        actions={<InvoiceActions id={invoice.id} status={status} today={ctx.today} />}
      />
      <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              {facts.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="text-right font-medium tabular-nums">{value}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-4 border-t pt-2 text-base">
                <dt className="font-semibold">Total</dt>
                <dd className="font-semibold tabular-nums">{money(invoice.totalMinor)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
        <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
          <iframe title="Invoice PDF" src={`/api/invoices/${invoice.id}/pdf#toolbar=0&navpanes=0&view=FitH`} className="h-[80vh] w-full" />
        </div>
      </div>
    </PageBody>
  )
}
