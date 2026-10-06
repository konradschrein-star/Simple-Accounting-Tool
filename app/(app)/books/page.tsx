import { DownloadIcon, LockIcon, Trash2Icon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { ClosePanel } from "@/components/books/close-panel"
import { PnlTable } from "@/components/books/pnl-table"
import { PageBody, PageHeader } from "@/components/shell/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { computePnl } from "@/bookkeeping/pnl"
import { parseRangeKey, RANGE_KEYS, RANGE_LABELS, reportRange } from "@/bookkeeping/ranges"
import { db } from "@/db/client"
import { formatDate, monthLabel, priorMonth } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import { requireReadyOrg } from "@/server/context"
import { removeRule } from "@/server/actions/bookkeeping"
import { getClose, listCloses, monthChecklist, pnlInputs } from "@/server/repos/books"
import { listAccounts, listRules } from "@/server/repos/ledger"

export const metadata: Metadata = { title: "Books & P&L" }

const TABS = [
  ["pnl", "Profit & loss"],
  ["close", "Monthly close"],
  ["rules", "Rules"],
] as const

export default async function BooksPage({ searchParams }: { searchParams: Promise<{ tab?: string; range?: string; m?: string }> }) {
  const ctx = await requireReadyOrg()
  const params = await searchParams
  const tab = TABS.some(([k]) => k === params.tab) ? params.tab! : "pnl"
  const { currency, locale } = ctx.settings
  const accounts = listAccounts(db, ctx.orgId)
  const currentMonth = ctx.today.slice(0, 7)

  let body: React.ReactNode
  if (tab === "pnl") {
    const key = parseRangeKey(params.range)
    const range = reportRange(key, ctx.today)
    const pnl = computePnl({ ...pnlInputs(db, ctx.orgId), accounts, ...range })
    body = (
      <>
        <div className="flex flex-wrap items-center gap-1">
          {RANGE_KEYS.map((k) => (
            <Button key={k} asChild size="sm" variant={k === key ? "secondary" : "ghost"}>
              <Link href={`/books?tab=pnl&range=${k}`}>{RANGE_LABELS[k]}</Link>
            </Button>
          ))}
          <Button asChild size="sm" variant="outline" className="ml-auto">
            <a href={`/api/books/pnl?range=${key}`}>
              <DownloadIcon /> Export CSV
            </a>
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {formatDate(range.period.from, locale)} – {formatDate(range.period.to, locale)} · compared with {formatDate(range.prior.from, locale)} – {formatDate(range.prior.to, locale)} · cash basis
        </p>
        <PnlTable pnl={pnl} currency={currency} locale={locale} />
        {pnl.uncategorizedMinor ? (
          <p className="text-sm text-muted-foreground">
            {formatMoney(pnl.uncategorizedMinor, currency, locale)} in uncategorized transactions is not included.{" "}
            <Link href="/review" className="underline underline-offset-4">Categorize them</Link>
          </p>
        ) : null}
      </>
    )
  } else if (tab === "close") {
    const closes = new Map(listCloses(db, ctx.orgId).map((c) => [c.period, c]))
    const months = [currentMonth]
    while (months.length < 6) months.push(priorMonth(months.at(-1)!))
    const selected = months.includes(params.m ?? "") ? params.m! : priorMonth(currentMonth)
    const close = getClose(db, ctx.orgId, selected)
    body = (
      <>
        <div className="flex flex-wrap gap-1">
          {months.map((m) => {
            const status = closes.get(m)?.status
            return (
              <Button key={m} asChild size="sm" variant={m === selected ? "secondary" : "ghost"}>
                <Link href={`/books?tab=close&m=${m}`}>
                  {monthLabel(m)}
                  {status === "closed" ? <LockIcon className="size-3" /> : status === "in_review" ? <Badge variant="outline" className="ml-1 h-4 px-1 text-[10px]">draft</Badge> : null}
                </Link>
              </Button>
            )
          })}
        </div>
        <ClosePanel
          key={`${selected}-${close?.aiSummary?.headline ?? ""}-${close?.status ?? ""}`}
          period={selected}
          label={monthLabel(selected)}
          status={close?.status ?? "open"}
          checklist={monthChecklist(db, ctx.orgId, selected)}
          summary={close?.aiSummary ?? null}
          ended={selected < currentMonth}
        />
      </>
    )
  } else {
    const rules = listRules(db, ctx.orgId)
    const accountName = new Map(accounts.map((a) => [a.id, `${a.code} ${a.name}`]))
    body = (
      <Card className="py-0">
        <CardHeader className="pt-6">
          <CardTitle className="text-base">Categorization rules</CardTitle>
          <CardDescription>Rules run before the AI. Create them from the review queue with “Create rule”.</CardDescription>
        </CardHeader>
        {rules.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">When</TableHead>
                <TableHead>Book to</TableHead>
                <TableHead className="text-right">Used</TableHead>
                <TableHead className="w-12 pr-6" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="pl-6">
                    {r.matchField} {r.matchType} <strong>“{r.pattern}”</strong>
                    {r.sign !== "any" ? <span className="text-muted-foreground"> · {r.sign === "debit" ? "money out" : "money in"}</span> : null}
                  </TableCell>
                  <TableCell>{accountName.get(r.ledgerAccountId) ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.hitCount}×</TableCell>
                  <TableCell className="pr-6">
                    <form action={removeRule.bind(null, r.id)}>
                      <Button size="icon" variant="ghost" aria-label="Delete rule">
                        <Trash2Icon />
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <CardContent className="pb-6 text-sm text-muted-foreground">No rules yet.</CardContent>
        )}
      </Card>
    )
  }

  return (
    <PageBody>
      <PageHeader title="Books & P&L" description={`Chart of accounts: ${accounts.length} accounts mapped to ${ctx.jurisdiction.name} tax lines.`} />
      <div className="flex gap-1 border-b">
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            href={`/books?tab=${key}`}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === key ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {label}
          </Link>
        ))}
      </div>
      {body}
    </PageBody>
  )
}
