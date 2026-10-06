import { ArrowLeftIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DocumentTimeline } from "@/components/invoices/document-timeline"
import { InvoiceActions } from "@/components/invoices/invoice-actions"
import { InvoiceEditor } from "@/components/invoices/invoice-editor"
import { PageBody, PageHeader } from "@/components/shell/page-header"
import { InvoiceStatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CURRENCIES } from "@/db/schema"
import { db } from "@/db/client"
import { invoiceRatesBp } from "@/jurisdictions/tax-profile"
import { eInvoiceReadiness } from "@/einvoice/service"
import { displayStatus, KIND_LABELS, openAmount } from "@/invoicing/documents"
import { publicLink, workspaceCanEmail } from "@/invoicing/service"
import { formatDate } from "@/lib/dates"
import { formatMoney, toBaseMinor } from "@/lib/money"
import { requireReadyOrg } from "@/server/context"
import { listClients } from "@/server/repos/clients"
import { previewContext } from "@/server/repos/invoices"
import { listProducts } from "@/server/repos/products"
import { seriesForTemplate } from "@/server/repos/recurring"
import { taxProfileOf } from "@/server/repos/workspace"

export const metadata: Metadata = { title: "Document" }

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireReadyOrg()
  const found = previewContext(db, ctx.orgId, ctx.jurisdiction, id)
  if (!found) notFound()
  const { invoice, items, client, blockers, payments, events, related, paidMinor } = found
  const { locale } = ctx.settings
  const kind = invoice.kind
  const label = KIND_LABELS[kind].singular
  const status = displayStatus(invoice, ctx.today, paidMinor)
  const listHref = kind === "quote" ? "/quotes" : kind === "credit_note" ? "/invoices?tab=credit-notes" : "/invoices"
  const back = (
    <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
      <Link href={listHref}>
        <ArrowLeftIcon /> {KIND_LABELS[kind].plural}
      </Link>
    </Button>
  )

  if (invoice.status === "draft") {
    const template = seriesForTemplate(db, ctx.orgId, invoice.id)
    return (
      <PageBody className="max-w-[1600px]">
        {back}
        <PageHeader
          title={template ? "Recurring invoice template" : `New ${label.toLowerCase()}`}
          description="Changes save automatically. The preview on the right is the exact PDF your client receives."
        />
        <InvoiceEditor
          invoiceId={invoice.id}
          kind={kind}
          recurringTemplate={!!template}
          initial={{
            clientId: invoice.clientId ?? "",
            currency: invoice.currency,
            issueDate: invoice.issueDate,
            serviceDate: invoice.serviceDate ?? "",
            dueDate: invoice.dueDate,
            notes: invoice.notes,
            paymentTerms: /^\d+$/.test(invoice.paymentTerms) ? "" : invoice.paymentTerms,
            stripePaymentLink: invoice.stripePaymentLink,
            lines: items,
          }}
          clients={listClients(db, ctx.orgId).map(({ client: c }) => ({ id: c.id, name: c.name, currency: c.currency }))}
          products={listProducts(db, ctx.orgId).map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            unit: p.unit,
            unitPriceMinor: p.unitPriceMinor,
            taxRateBp: p.taxRateBp,
          }))}
          currencies={CURRENCIES}
          taxRatesBp={invoiceRatesBp(ctx.jurisdiction, ctx.settings)}
          taxLabel={ctx.jurisdiction.taxLabel}
          locale={locale}
          serviceDateLabel={ctx.jurisdiction.code === "de" ? "Leistungsdatum" : "Date of supply"}
          blockers={blockers}
          exemptionNote={ctx.jurisdiction.exemptionNote(taxProfileOf(ctx.settings))}
        />
      </PageBody>
    )
  }

  const money = (minor: number) => formatMoney(minor, invoice.currency, locale)
  const open = openAmount(invoice.totalMinor, paidMinor)
  const facts: [string, React.ReactNode][] = [
    ["Client", client?.name ?? "—"],
    ["Issued", formatDate(invoice.issueDate, locale)],
    [kind === "quote" ? "Valid until" : "Due", formatDate(invoice.dueDate, locale)],
    ["Net", money(invoice.subtotalMinor)],
    [ctx.jurisdiction.taxLabel, money(invoice.taxMinor)],
  ]
  if (invoice.currency !== ctx.settings.currency)
    facts.push([`In ${ctx.settings.currency}`, formatMoney(toBaseMinor(invoice.totalMinor, invoice.fxRateMicro), ctx.settings.currency, locale)])
  if (related)
    facts.push([
      related.kind === "credit_note" ? "Credit note" : related.kind === "quote" ? "From quote" : "Invoice",
      <Link key="rel" href={`/invoices/${related.id}`} className="hover:underline">
        {related.number ?? "Draft"}
      </Link>,
    ])

  return (
    <PageBody>
      {back}
      <PageHeader
        title={invoice.number ?? label}
        description={
          <span className="flex items-center gap-2">
            <InvoiceStatusBadge status={status} /> {label} · {money(invoice.totalMinor)} {client ? `· ${client.name}` : ""}
          </span>
        }
        actions={
          <InvoiceActions
            id={invoice.id}
            kind={kind}
            status={status}
            today={ctx.today}
            openMinor={open}
            clientEmail={client?.email ?? ""}
            publicUrl={invoice.publicToken ? publicLink(invoice.publicToken) : null}
            emailEnabled={workspaceCanEmail(ctx.settings)}
            eInvoice={ctx.jurisdiction.code === "de" ? eInvoiceReadiness(found, ctx.jurisdiction) : null}
          />
        }
      />
      <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2 text-sm">
                {facts.map(([factLabel, value]) => (
                  <div key={factLabel} className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">{factLabel}</dt>
                    <dd className="text-right font-medium tabular-nums">{value}</dd>
                  </div>
                ))}
                <div className="flex justify-between gap-4 border-t pt-2 text-base">
                  <dt className="font-semibold">Total</dt>
                  <dd className="font-semibold tabular-nums">{money(invoice.totalMinor)}</dd>
                </div>
                {kind === "invoice" && paidMinor > 0 ? (
                  <>
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Received</dt>
                      <dd className="text-right font-medium text-success tabular-nums">{money(paidMinor)}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Still open</dt>
                      <dd className="text-right font-medium tabular-nums">{money(open)}</dd>
                    </div>
                  </>
                ) : null}
              </dl>
            </CardContent>
          </Card>
          {payments.length ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Payments</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {payments.map((p) => (
                    <li key={p.id} className="flex justify-between gap-4">
                      <span className="text-muted-foreground">
                        {formatDate(p.date, locale)} · {p.method === "bank" ? "bank match" : p.method}
                      </span>
                      <span className="font-medium tabular-nums">{money(p.amountMinor)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <DocumentTimeline
                events={events.map((e) => ({ id: e.id, type: e.type, detail: e.detail, at: e.at.getTime() }))}
                currency={invoice.currency}
                locale={locale}
                timeZone={ctx.settings.timezone}
              />
            </CardContent>
          </Card>
        </div>
        <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
          <iframe title={`${label} PDF`} src={`/api/invoices/${invoice.id}/pdf#toolbar=0&navpanes=0&view=FitH`} className="h-[80vh] w-full" />
        </div>
      </div>
    </PageBody>
  )
}
