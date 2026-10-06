import { PartyPopperIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { ReviewQueue } from "@/components/bookkeeping/review-queue"
import { PageBody, PageHeader } from "@/components/shell/page-header"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { db } from "@/db/client"
import { requireReadyOrg } from "@/server/context"
import { listAccounts, reviewQueue } from "@/server/repos/ledger"

export const metadata: Metadata = { title: "Review queue" }

export default async function ReviewPage() {
  const ctx = await requireReadyOrg()
  const rows = reviewQueue(db, ctx.orgId)
  return (
    <PageBody>
      <PageHeader
        title="Review queue"
        description="Rules and AI handle the routine lines. Anything uncertain lands here — confirm it once and teach the system for next time."
      />
      {rows.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PartyPopperIcon />
            </EmptyMedia>
            <EmptyTitle>All caught up</EmptyTitle>
            <EmptyDescription>Every transaction is categorized. Your P&amp;L is up to date.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="flex-row justify-center">
            <Button asChild>
              <Link href="/books">Open P&amp;L</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/imports">Import more</Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <ReviewQueue
          accounts={listAccounts(db, ctx.orgId)}
          currency={ctx.settings.currency}
          locale={ctx.settings.locale}
          rows={rows.map((r) => ({
            id: r.id,
            date: r.date,
            description: r.description,
            counterparty: r.counterparty,
            amountMinor: r.amountMinor,
            suggestedAccountId: r.ledgerAccountId,
            confidenceBp: r.aiConfidenceBp,
          }))}
        />
      )}
    </PageBody>
  )
}
