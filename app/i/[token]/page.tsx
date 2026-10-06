import { getSessionCookie } from "better-auth/cookies"
import { CheckCircle2Icon, DownloadIcon, ExternalLinkIcon } from "lucide-react"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { QuoteResponse } from "@/components/invoices/quote-response"
import { InvoiceStatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/db/client"
import { displayStatus, KIND_LABELS, openAmount } from "@/invoicing/documents"
import { formatDate, todayIn } from "@/lib/dates"
import { env } from "@/lib/env"
import { formatMoney } from "@/lib/money"
import { findByPublicToken, markViewed } from "@/server/repos/invoices"
import { getSettings } from "@/server/repos/workspace"

export const metadata: Metadata = { title: "Document", robots: { index: false, follow: false } }

/** What a client sees when they open the link from an email: no login, just the document and how to pay or answer. */
export default async function PublicDocumentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const found = findByPublicToken(db, token)
  if (!found) notFound()
  const { invoice, paidMinor } = found
  // The owner previewing their own link shouldn't count as "opened by the client".
  if (!getSessionCookie(await headers())) markViewed(db, invoice)

  const settings = getSettings(db, invoice.orgId)
  const snap = invoice.snapshot!
  const locale = snap.locale
  const today = todayIn(settings.timezone)
  const status = displayStatus(invoice, today, paidMinor)
  const label = KIND_LABELS[invoice.kind].singular
  const money = (minor: number) => formatMoney(minor, invoice.currency, locale)
  const open = openAmount(invoice.totalMinor, paidMinor)
  const payable = invoice.kind === "invoice" && (status === "open" || status === "overdue" || status === "partial")
  const sellerName = snap.seller.legalName || snap.seller.name
  const bank = [
    snap.seller.bankIban && ["IBAN", snap.seller.bankIban],
    snap.seller.bankBic && ["BIC", snap.seller.bankBic],
    snap.seller.ukSortCode && ["Sort code", snap.seller.ukSortCode],
    snap.seller.ukAccountNumber && ["Account", snap.seller.ukAccountNumber],
    snap.seller.usRoutingNumber && ["Routing", snap.seller.usRoutingNumber],
  ].filter(Boolean) as [string, string][]

  return (
    <main className="min-h-svh bg-muted/40">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[22rem_minmax(0,1fr)] lg:py-12">
        <div className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">{sellerName}</p>
            <h1 className="text-2xl font-semibold tracking-tight">
              {label} {invoice.number}
            </h1>
          </div>
          <Card>
            <CardHeader>
              <CardDescription className="flex items-center justify-between gap-2">
                {invoice.kind === "quote" ? "Quoted amount" : invoice.kind === "credit_note" ? "Credited amount" : status === "partial" ? "Still to pay" : "Amount"}
                <InvoiceStatusBadge status={status} />
              </CardDescription>
              <CardTitle className="text-3xl tabular-nums">{money(status === "partial" ? open : invoice.totalMinor)}</CardTitle>
              <CardDescription>
                {invoice.kind === "quote"
                  ? `Valid until ${formatDate(invoice.dueDate, locale)}`
                  : invoice.kind === "invoice" && status !== "paid" && status !== "cancelled"
                    ? `Due ${formatDate(invoice.dueDate, locale)}`
                    : `Issued ${formatDate(invoice.issueDate, locale)}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {status === "paid" ? (
                <p className="flex items-center gap-2 text-sm text-success">
                  <CheckCircle2Icon className="size-4" /> Paid in full — thank you!
                </p>
              ) : null}
              {payable && invoice.stripePaymentLink ? (
                <Button asChild className="w-full" size="lg">
                  <a href={invoice.stripePaymentLink} target="_blank" rel="noopener noreferrer">
                    Pay online <ExternalLinkIcon />
                  </a>
                </Button>
              ) : null}
              {invoice.kind === "quote" && status === "sent" ? <QuoteResponse token={token} /> : null}
              <Button asChild variant="outline" className="w-full">
                <a href={`/i/${token}/pdf`}>
                  <DownloadIcon /> Download PDF
                </a>
              </Button>
            </CardContent>
          </Card>
          {payable && bank.length ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pay by bank transfer</CardTitle>
                <CardDescription>Please use {invoice.number} as the payment reference.</CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="space-y-1.5 text-sm">
                  {bank.map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="font-mono select-all">{v}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Sent with {env().BRAND_NAME}. Questions? Reply to the email or contact {snap.seller.email || sellerName}.
          </p>
        </div>
        <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
          <iframe title={`${label} ${invoice.number}`} src={`/i/${token}/pdf?inline=1#toolbar=0&navpanes=0&view=FitH`} className="h-[85vh] w-full" />
        </div>
      </div>
    </main>
  )
}
