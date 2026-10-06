import { DownloadIcon, LockIcon, Trash2Icon } from "lucide-react"
import Link from "next/link"
import { FilterLinks } from "@/components/shell/page-tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { AccountRef } from "@/bookkeeping/categorize"
import { computePnl } from "@/bookkeeping/pnl"
import { parseRangeKey, RANGE_KEYS, RANGE_LABELS, reportRange } from "@/bookkeeping/ranges"
import { db } from "@/db/client"
import { addMonths, formatDate, monthKey, monthLabel, priorMonth } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import type { ReadyOrgContext } from "@/server/context"
import { removeRule } from "@/server/actions/bookkeeping"
import { getClose, listCloses, monthChecklist, pnlInputs } from "@/server/repos/books"
import { listRules } from "@/server/repos/ledger"
import { ClosePanel } from "./close-panel"
import { PnlTable } from "./pnl-table"

export async function PnlTab({ ctx, accounts, range: rangeParam }: { ctx: ReadyOrgContext; accounts: AccountRef[]; range?: string }) {
  const { currency, locale } = ctx.settings
  const key = parseRangeKey(rangeParam)
  const range = reportRange(key, ctx.today)
  const pnl = computePnl({ ...pnlInputs(db, ctx.orgId), accounts, ...range })
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <FilterLinks current={key} items={RANGE_KEYS.map((k) => ({ key: k, href: `/books?tab=pnl&range=${k}`, label: RANGE_LABELS[k] }))} />
        <Button asChild size="sm" variant="outline" className="ml-auto">
          <a href={`/api/books/pnl?range=${key}`}>
            <DownloadIcon /> Export CSV
          </a>
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        {formatDate(range.period.from, locale)} – {formatDate(range.period.to, locale)} · compared with {formatDate(range.prior.from, locale)} –{" "}
        {formatDate(range.prior.to, locale)} · cash basis
      </p>
      <PnlTable pnl={pnl} currency={currency} locale={locale} />
      {pnl.uncategorizedMinor ? (
        <p className="text-sm text-muted-foreground">
          {formatMoney(pnl.uncategorizedMinor, currency, locale)} in uncategorized transactions is not included.{" "}
          <Link href="/review" className="underline underline-offset-4">
            Categorize them
          </Link>
        </p>
      ) : null}
    </>
  )
}

export async function CloseTab({ ctx, month }: { ctx: ReadyOrgContext; month?: string }) {
  const currentMonth = monthKey(ctx.today)
  const months = Array.from({ length: 6 }, (_, i) => addMonths(currentMonth, -i))
  const selected = month && months.includes(month) ? month : priorMonth(currentMonth)
  const closes = new Map(listCloses(db, ctx.orgId).map((c) => [c.period, c]))
  const close = closes.get(selected) ?? getClose(db, ctx.orgId, selected)
  return (
    <>
      <FilterLinks
        current={selected}
        items={months.map((m) => {
          const status = closes.get(m)?.status
          return {
            key: m,
            href: `/books?tab=close&m=${m}`,
            label: (
              <>
                {monthLabel(m)}
                {status === "closed" ? (
                  <LockIcon className="size-3" aria-label="closed" />
                ) : status === "in_review" ? (
                  <Badge variant="outline" className="ml-1 h-4 px-1 text-[10px]">
                    draft
                  </Badge>
                ) : null}
              </>
            ),
          }
        })}
      />
      <ClosePanel
        key={`${selected}-${close?.status ?? "open"}-${close?.aiSummary?.headline ?? ""}`}
        period={selected}
        label={monthLabel(selected)}
        status={close?.status ?? "open"}
        checklist={monthChecklist(db, ctx.orgId, selected)}
        summary={close?.aiSummary ?? null}
        ended={selected < currentMonth}
      />
    </>
  )
}

export async function RulesTab({ ctx, accounts }: { ctx: ReadyOrgContext; accounts: AccountRef[] }) {
  const rules = listRules(db, ctx.orgId)
  const accountName = new Map(accounts.map((a) => [a.id, `${a.code} ${a.name}`]))
  return (
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
                    <Button size="icon" variant="ghost" aria-label={`Delete rule for ${r.pattern}`}>
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
