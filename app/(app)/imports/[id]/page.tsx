import { inArray } from "drizzle-orm"
import { ArrowLeftIcon, CheckCircle2Icon, CircleAlertIcon, SparklesIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { BatchStatusBadge } from "@/components/imports/batch-status"
import { MappingEditor } from "@/components/imports/mapping-editor"
import { ReviewTable } from "@/components/imports/review-table"
import { ImportStatusPoller } from "@/components/imports/status-poller"
import { PageBody, PageHeader } from "@/components/shell/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Spinner } from "@/components/ui/spinner"
import { db } from "@/db/client"
import { invoices } from "@/db/schema"
import type { CsvMapping } from "@/ingest/csv/types"
import { csvPreview } from "@/ingest/service"
import { importErrorMessage } from "@/lib/import-errors"
import { requireReadyOrg } from "@/server/context"
import { deleteImport, retryImport } from "@/server/actions/imports"
import { getBatch, listRows } from "@/server/repos/imports"

export const metadata: Metadata = { title: "Import" }

export default async function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireReadyOrg()
  const batch = getBatch(db, ctx.orgId, (await params).id)
  if (!batch) notFound()
  const { currency, locale } = ctx.settings

  let body: React.ReactNode
  if (batch.status === "parsing" || batch.status === "uploaded") {
    body = (
      <Empty className="border">
        <ImportStatusPoller batchId={batch.id} />
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Spinner />
          </EmptyMedia>
          <EmptyTitle>Reading your statement…</EmptyTitle>
          <EmptyDescription>
            Our AI reader extracts every line, then we check the result against the statement’s own balances. This usually takes 10–40 seconds.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  } else if (batch.status === "failed") {
    body = (
      <Alert variant="destructive">
        <CircleAlertIcon />
        <AlertTitle>We couldn’t import this file</AlertTitle>
        <AlertDescription>
          <p>{importErrorMessage(batch.errorCode, batch.errorMessage)}</p>
          <div className="mt-3 flex gap-2">
            {batch.source === "pdf" && batch.filePath && !["ENCRYPTED_PDF", "TOO_MANY_PAGES", "CURRENCY_MISMATCH"].includes(batch.errorCode ?? "") ? (
              <form action={retryImport.bind(null, batch.id)}>
                <Button size="sm" variant="outline">Retry</Button>
              </form>
            ) : null}
            <form action={deleteImport.bind(null, batch.id)}>
              <Button size="sm" variant="ghost">Delete</Button>
            </form>
          </div>
        </AlertDescription>
      </Alert>
    )
  } else if (batch.status === "needs_mapping") {
    const preview = csvPreview(batch, ctx.jurisdiction.code)
    body = (
      <MappingEditor
        batchId={batch.id}
        header={preview.header}
        rows={preview.rows.slice(0, (batch.csvMapping as CsvMapping).headerRow + 26)}
        initial={batch.csvMapping as CsvMapping}
        dateFormatAmbiguous={preview.dateFormatAmbiguous}
        currency={currency}
        locale={locale}
      />
    )
  } else if (batch.status === "staged") {
    const rows = listRows(db, batch.id)
    const matchedIds = rows.flatMap((r) => (r.matchedInvoiceId ? [r.matchedInvoiceId] : []))
    const numbers = new Map(
      matchedIds.length ? db.select({ id: invoices.id, number: invoices.number }).from(invoices).where(inArray(invoices.id, matchedIds)).all().map((i) => [i.id, i.number]) : [],
    )
    body = (
      <ReviewTable
        batchId={batch.id}
        reconciliation={batch.reconciliation}
        currency={currency}
        locale={locale}
        rows={rows.map((r) => ({
          id: r.id,
          date: r.date,
          description: r.description,
          counterparty: r.counterparty,
          amountMinor: r.amountMinor,
          issues: r.issues,
          include: r.include,
          matchedInvoice: r.matchedInvoiceId ? { id: r.matchedInvoiceId, number: numbers.get(r.matchedInvoiceId) ?? null } : null,
        }))}
      />
    )
  } else {
    body = (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CheckCircle2Icon className="text-success" />
          </EmptyMedia>
          <EmptyTitle>Booked</EmptyTitle>
          <EmptyDescription>{batch.rowCount} lines processed. Categorized lines are on your books; anything uncertain waits in the review queue.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row justify-center">
          <Button asChild>
            <Link href="/review">Open review queue</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/transactions">See transactions</Link>
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  return (
    <PageBody>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href="/imports">
          <ArrowLeftIcon /> Imports
        </Link>
      </Button>
      <PageHeader
        title={batch.filename}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <BatchStatusBadge status={batch.status} />
            {batch.modelUsed ? (
              <span className="flex items-center gap-1 text-xs">
                <SparklesIcon className="size-3" /> Read by {batch.modelUsed}
                {batch.attempts > 1 ? " (escalated)" : ""}
              </span>
            ) : null}
          </span>
        }
        actions={
          batch.status === "staged" || batch.status === "needs_mapping" ? (
            <form action={deleteImport.bind(null, batch.id)}>
              <Button variant="ghost" size="sm">Discard import</Button>
            </form>
          ) : null
        }
      />
      {body}
    </PageBody>
  )
}
