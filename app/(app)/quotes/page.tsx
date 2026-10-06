import type { Metadata } from "next"
import { DocumentList, NewDocumentButton } from "@/components/invoices/document-list"
import { PageBody, PageHeader } from "@/components/shell/page-header"
import { requireReadyOrg } from "@/server/context"

export const metadata: Metadata = { title: "Quotes" }

export default async function QuotesPage() {
  const ctx = await requireReadyOrg()
  return (
    <PageBody>
      <PageHeader
        title="Quotes"
        description="Send an offer, track acceptance, and turn it into an invoice in one click."
        actions={<NewDocumentButton kind="quote" />}
      />
      <DocumentList ctx={ctx} kind="quote" />
    </PageBody>
  )
}
