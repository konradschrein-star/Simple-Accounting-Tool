import { ReceiptTextIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { TransactionSheet, type TransactionDetail } from "@/components/bookkeeping/transaction-sheet"
import { TransactionsTable } from "@/components/bookkeeping/transactions-table"
import { PageBody, PageHeader } from "@/components/shell/page-header"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { db } from "@/db/client"
import { defaultInputTaxBp } from "@/jurisdictions"
import { monthKey, monthLabel } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import { requireReadyOrg, type ReadyOrgContext } from "@/server/context"
import { invoiceNumbers } from "@/server/repos/invoices"
import { closedPeriods, getTransaction, listAccounts, listTransactions, transactionMonths } from "@/server/repos/ledger"
import { receiptForTransaction, receiptIdsByTransaction } from "@/server/repos/receipts"

export const metadata: Metadata = { title: "Transactions" }

/** Everything the detail sheet shows for one ledger line, or null when it isn't this workspace's. */
function transactionDetail(ctx: ReadyOrgContext, id: string, accounts: ReturnType<typeof listAccounts>, closed: Set<string>): TransactionDetail | null {
  const txn = getTransaction(db, ctx.orgId, id)
  if (!txn) return null
  const account = accounts.find((a) => a.id === txn.ledgerAccountId)
  const receipt = receiptForTransaction(db, ctx.orgId, id)
  return {
    id: txn.id,
    date: txn.date,
    description: txn.description,
    counterparty: txn.counterparty,
    amountMinor: txn.amountMinor,
    accountId: txn.ledgerAccountId,
    note: txn.note,
    vatRateBp: txn.vatRateBp,
    defaultVatRateBp: account?.kind === "expense" ? defaultInputTaxBp(ctx.jurisdiction, account.code) : null,
    locked: closed.has(monthKey(txn.date)),
    invoice: txn.invoiceId ? { id: txn.invoiceId, number: invoiceNumbers(db, ctx.orgId, [txn.invoiceId]).get(txn.invoiceId) ?? null } : null,
    receipt: receipt
      ? {
          id: receipt.id,
          filename: receipt.filename,
          mimeType: receipt.mimeType,
          vendor: receipt.extracted?.vendor ?? (receipt.status === "processing" ? null : receipt.filename),
          totalMinor: receipt.extracted?.totalMinor ?? null,
          currency: receipt.extracted?.currency ?? null,
        }
      : null,
  }
}

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<{ month?: string; account?: string; q?: string; txn?: string }> }) {
  const ctx = await requireReadyOrg()
  const filter = await searchParams
  const rows = listTransactions(db, ctx.orgId, { month: filter.month, accountId: filter.account, q: filter.q?.trim() || undefined })
  const accounts = listAccounts(db, ctx.orgId)
  const closed = closedPeriods(db, ctx.orgId)
  const months = transactionMonths(db, ctx.orgId)
  const receipts = receiptIdsByTransaction(db, ctx.orgId)
  const detail = filter.txn ? transactionDetail(ctx, filter.txn, accounts, closed) : null
  const net = rows.reduce((s, r) => s + r.txn.amountMinor, 0)
  const link = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams(Object.entries({ ...filter, txn: undefined, ...patch }).filter((e): e is [string, string] => !!e[1]))
    return `/transactions${params.size ? `?${params}` : ""}`
  }

  return (
    <PageBody>
      <PageHeader title="Transactions" description="Your ledger — every booked bank line and its account." />
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant={!filter.month ? "secondary" : "ghost"}>
          <Link href={link({ month: undefined })}>All months</Link>
        </Button>
        {months.slice(0, 12).map((m) => (
          <Button key={m} asChild size="sm" variant={filter.month === m ? "secondary" : "ghost"}>
            <Link href={link({ month: m })}>
              {monthLabel(m, "short")}
              {closed.has(m) ? " 🔒" : ""}
            </Link>
          </Button>
        ))}
        <form className="ml-auto flex gap-2" action="/transactions">
          {filter.month ? <input type="hidden" name="month" value={filter.month} /> : null}
          <Input name="q" placeholder="Search…" defaultValue={filter.q} className="h-8 w-48" />
        </form>
      </div>
      {rows.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ReceiptTextIcon />
            </EmptyMedia>
            <EmptyTitle>No transactions{filter.month || filter.q ? " match this filter" : " yet"}</EmptyTitle>
            <EmptyDescription>Import a bank statement to fill your ledger.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <Link href="/imports">Import a statement</Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {rows.length} transactions · net {formatMoney(net, ctx.settings.currency, ctx.settings.locale)}
          </p>
          <TransactionsTable
            accounts={accounts}
            currency={ctx.settings.currency}
            locale={ctx.settings.locale}
            rows={rows.map(({ txn }) => ({
              id: txn.id,
              date: txn.date,
              description: txn.description,
              counterparty: txn.counterparty,
              amountMinor: txn.amountMinor,
              accountId: txn.ledgerAccountId,
              source: txn.categorizationSource,
              needsReview: txn.reviewStatus === "needs_review",
              locked: closed.has(monthKey(txn.date)),
              hasReceipt: receipts.has(txn.id),
            }))}
          />
        </>
      )}
      {detail ? (
        <TransactionSheet
          key={detail.id}
          detail={detail}
          accounts={accounts}
          ratesBp={ctx.jurisdiction.taxRatesBp}
          taxLabel={ctx.jurisdiction.taxLabel}
          showVat={ctx.jurisdiction.code !== "us" && ctx.settings.taxRegistered && !ctx.settings.smallBusinessExempt}
          currency={ctx.settings.currency}
          locale={ctx.settings.locale}
        />
      ) : null}
    </PageBody>
  )
}
