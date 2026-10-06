import { PaperclipIcon } from "lucide-react"
import type { Metadata } from "next"
import { ReceiptInbox, ReceiptUploader } from "@/components/receipts/receipt-inbox"
import { PageBody, PageHeader } from "@/components/shell/page-header"
import { PageTabs, parseTab } from "@/components/shell/page-tabs"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { db } from "@/db/client"
import { env } from "@/lib/env"
import { requireReadyOrg } from "@/server/context"
import { listReceipts, unreceiptedExpenses } from "@/server/repos/receipts"

export const metadata: Metadata = { title: "Receipts" }

const TABS = [
  ["inbox", "Inbox"],
  ["matched", "Matched"],
] as const

export default async function ReceiptsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await requireReadyOrg()
  const tab = parseTab(TABS, (await searchParams).tab)
  const receipts = listReceipts(db, ctx.orgId, tab)
  return (
    <PageBody>
      <PageHeader
        title="Receipts"
        description={`Every expense needs its document — for your ${ctx.jurisdiction.taxLabel} reclaim and for the tax office. Drop them here and we match them to your bank payments.`}
      />
      <ReceiptUploader />
      <PageTabs basePath="/receipts" tabs={TABS} current={tab} />
      {receipts.length ? (
        <ReceiptInbox
          receipts={receipts}
          candidates={unreceiptedExpenses(db, ctx.orgId)}
          currency={ctx.settings.currency}
          locale={ctx.settings.locale}
          taxLabel={ctx.jurisdiction.taxLabel}
          aiEnabled={!!env().OPENROUTER_API_KEY}
        />
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PaperclipIcon />
            </EmptyMedia>
            <EmptyTitle>{tab === "inbox" ? "Inbox zero" : "Nothing matched yet"}</EmptyTitle>
            <EmptyDescription>
              {tab === "inbox"
                ? "Upload receipts above — each one is read automatically and paired with its bank payment."
                : "Matched receipts show up here, attached to their transactions."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </PageBody>
  )
}
