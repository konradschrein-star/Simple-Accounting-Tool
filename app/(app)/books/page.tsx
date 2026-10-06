import type { Metadata } from "next"
import { CloseTab, PnlTab, RulesTab } from "@/components/books/books-tabs"
import { VatTab } from "@/components/books/vat-tab"
import { PageBody, PageHeader } from "@/components/shell/page-header"
import { PageTabs, parseTab } from "@/components/shell/page-tabs"
import { db } from "@/db/client"
import { requireReadyOrg } from "@/server/context"
import { listAccounts } from "@/server/repos/ledger"

export const metadata: Metadata = { title: "Books & P&L" }

export default async function BooksPage({ searchParams }: { searchParams: Promise<{ tab?: string; range?: string; m?: string; p?: string }> }) {
  const ctx = await requireReadyOrg()
  const params = await searchParams
  const tabs = [
    ["pnl", "Profit & loss"],
    ["vat", ctx.jurisdiction.vatReturn.tabLabel],
    ["close", "Monthly close"],
    ["rules", "Rules"],
  ] as const
  const tab = parseTab(tabs, params.tab)
  const accounts = listAccounts(db, ctx.orgId)
  return (
    <PageBody>
      <PageHeader title="Books & P&L" description={`Chart of accounts: ${accounts.length} accounts mapped to ${ctx.jurisdiction.name} tax lines.`} />
      <PageTabs basePath="/books" tabs={tabs} current={tab} />
      {tab === "pnl" ? (
        <PnlTab ctx={ctx} accounts={accounts} range={params.range} />
      ) : tab === "vat" ? (
        <VatTab ctx={ctx} period={params.p} />
      ) : tab === "close" ? (
        <CloseTab ctx={ctx} month={params.m} />
      ) : (
        <RulesTab ctx={ctx} accounts={accounts} />
      )}
    </PageBody>
  )
}
